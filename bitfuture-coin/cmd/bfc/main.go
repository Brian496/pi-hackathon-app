package main

import (
    "crypto/ed25519"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "errors"
    "flag"
    "fmt"
    "io/ioutil"
    "math"
    "net/http"
    "log"
    "os"
    "path/filepath"
    "time"
)

type ChainParams struct {
    Ticker                string  `json:"ticker"`
    Name                  string  `json:"name"`
    Consensus             string  `json:"consensus"`
    TargetBlockTimeSecs   int     `json:"targetBlockTimeSeconds"`
    InitialSubsidy        float64 `json:"initialSubsidy"`
    MaxSupply             int64   `json:"maxSupply"`
    HalvingYears          int     `json:"halvingYears"`
    Premine               int64   `json:"premine"`
    Decimals              int     `json:"decimals"`
}

type BlockHeader struct {
    Version    int    `json:"version"`
    PrevHash   string `json:"prevHash"`
    MerkleRoot string `json:"merkleRoot"`
    Time       int64  `json:"time"`
    NBits      uint32 `json:"nBits"`
    Nonce      uint32 `json:"nonce"`
}

type Block struct {
    Header   BlockHeader `json:"header"`
    Coinbase float64     `json:"coinbase"`
    Miner    string      `json:"miner"`
    Height   int64       `json:"height"`
    Hash     string      `json:"hash"`
    Transactions []Transaction `json:"transactions"`
}

type ChainState struct {
    Params ChainParams `json:"params"`
    Tip    Block       `json:"tip"`
    Balances map[string]float64 `json:"balances"`
    UTXO map[string]TxOut `json:"utxo"`
    Mempool []Transaction `json:"mempool"`
}

// ---------------- Transactions / UTXO ----------------

type OutPoint struct {
    TxHash string `json:"txHash"`
    Index  int    `json:"index"`
}

type TxIn struct {
    PrevOut OutPoint `json:"prevOut"`
    SignatureHex string `json:"signatureHex"`
    PubKeyHex string `json:"pubKeyHex"`
}

type TxOut struct {
    Address string  `json:"address"`
    Amount  float64 `json:"amount"`
}

type Transaction struct {
    Inputs  []TxIn `json:"inputs"`
    Outputs []TxOut `json:"outputs"`
    Hash    string `json:"hash"`
}

func sha256Hex(b []byte) string {
    h := sha256.Sum256(b)
    return hex.EncodeToString(h[:])
}

func txHash(tx Transaction) string {
    // naive: hash of JSON without Hash field
    tmp := Transaction{Inputs: tx.Inputs, Outputs: tx.Outputs}
    buf, _ := json.Marshal(tmp)
    return sha256Hex(buf)
}

func ensureStateMaps(s *ChainState) {
    if s.Balances == nil { s.Balances = map[string]float64{} }
    if s.UTXO == nil { s.UTXO = map[string]TxOut{} }
}

func addUTXO(s *ChainState, txHash string, index int, out TxOut) {
    key := fmt.Sprintf("%s:%d", txHash, index)
    s.UTXO[key] = out
}

func spendUTXO(s *ChainState, op OutPoint) error {
    key := fmt.Sprintf("%s:%d", op.TxHash, op.Index)
    if _, ok := s.UTXO[key]; !ok {
        return fmt.Errorf("missing utxo %s", key)
    }
    delete(s.UTXO, key)
    return nil
}

func findSpendable(s *ChainState, addr string, amount float64) (sum float64, picks []OutPoint, err error) {
    for k, out := range s.UTXO {
        if out.Address != addr { continue }
        // parse key
        var h string
        var idx int
        _, e := fmt.Sscanf(k, "%[^:]:%d", &h, &idx)
        if e != nil { continue }
        sum += out.Amount
        picks = append(picks, OutPoint{TxHash: h, Index: idx})
        if sum+1e-12 >= amount { // small epsilon
            return sum, picks, nil
        }
    }
    return sum, picks, fmt.Errorf("insufficient funds: have %.8f need %.8f", sum, amount)
}

func verifyTx(s *ChainState, tx *Transaction) error {
    // Verify inputs exist and signatures match address ownership
    var totalIn float64
    for i, in := range tx.Inputs {
        key := fmt.Sprintf("%s:%d", in.PrevOut.TxHash, in.PrevOut.Index)
        utxo, ok := s.UTXO[key]
        if !ok { return fmt.Errorf("input %d not found: %s", i, key) }
        // verify sig using ed25519 and pub key -> address
        pubBytes, err := hex.DecodeString(in.PubKeyHex)
        if err != nil { return fmt.Errorf("bad pubkey") }
        sigBytes, err := hex.DecodeString(in.SignatureHex)
        if err != nil { return fmt.Errorf("bad signature") }
        pub := ed25519.PublicKey(pubBytes)
        // hash tx sans Hash field
        digest, _ := json.Marshal(Transaction{Inputs: tx.Inputs, Outputs: tx.Outputs})
        if !ed25519.Verify(pub, digest, sigBytes) {
            return fmt.Errorf("invalid signature for input %d", i)
        }
        // address match
        if addressFromPub(pub) != utxo.Address { return fmt.Errorf("input %d address mismatch", i) }
        totalIn += utxo.Amount
    }
    var totalOut float64
    for _, o := range tx.Outputs { totalOut += o.Amount }
    if totalIn+1e-12 < totalOut { return fmt.Errorf("inputs < outputs") }
    return nil
}

func readParams() (ChainParams, error) {
    var p ChainParams
    // Try current dir
    candidates := []string{
        filepath.FromSlash("params.json"),
        filepath.FromSlash("bitfuture-coin/params.json"),
    }
    // Try alongside executable
    if exe, err := os.Executable(); err == nil {
        candidates = append(candidates, filepath.Join(filepath.Dir(exe), "params.json"))
    }
    var data []byte
    var err error
    for _, c := range candidates {
        if b, e := ioutil.ReadFile(c); e == nil {
            data = b
            err = nil
            break
        } else {
            err = e
        }
    }
    if data == nil {
        return p, err
    }
    if err := json.Unmarshal(data, &p); err != nil {
        return p, err
    }
    return p, nil
}

func initChain() error {
    params, err := readParams()
    if err != nil {
        return err
    }
    genesis := Block{
        Header: BlockHeader{
            Version:    1,
            PrevHash:   "",
            MerkleRoot: "GENESIS",
            Time:       time.Now().Unix(),
            NBits:      0x1d00ffff,
            Nonce:      0,
        },
        Coinbase: 0,
        Miner:    "",
        Height:   0,
        Hash:     "GENESIS_HASH_PLACEHOLDER",
    }
    state := ChainState{Params: params, Tip: genesis, Balances: map[string]float64{}, UTXO: map[string]TxOut{}, Mempool: []Transaction{}}
    os.MkdirAll(filepath.FromSlash("bitfuture-coin/data"), 0o755)
    out := filepath.FromSlash("bitfuture-coin/data/chain.json")
    buf, _ := json.MarshalIndent(state, "", "  ")
    return ioutil.WriteFile(out, buf, 0o644)
}

func loadState() (ChainState, error) {
    var s ChainState
    b, err := ioutil.ReadFile(filepath.FromSlash("bitfuture-coin/data/chain.json"))
    if err != nil {
        return s, err
    }
    if err := json.Unmarshal(b, &s); err != nil {
        return s, err
    }
    return s, nil
}

func mineOnce(miner string) error {
    s, err := loadState()
    if err != nil {
        return err
    }
    if miner == "" {
        // default to first wallet address if exists
        if w, _ := loadWallet(); len(w.Keys) > 0 {
            miner = w.Keys[0].Address
        } else {
            return errors.New("no miner address provided and wallet empty; run 'bfc wallet new'")
        }
    }
    height := s.Tip.Height + 1
    subsidy := s.Params.InitialSubsidy
    // naive halving schedule
    blocksPerHalving := int64((365*24*3600*s.Params.HalvingYears)/s.Params.TargetBlockTimeSecs)
    halvings := int64(math.Floor(float64(height) / float64(blocksPerHalving)))
    reward := subsidy / math.Pow(2, float64(halvings))

    // include all mempool txs (no size limits yet)
    included := s.Mempool
    s.Mempool = []Transaction{}
    var fees float64
    for _, tx := range included {
        // sum inputs and outputs to compute fee
        var tin, tout float64
        for _, in := range tx.Inputs {
            key := fmt.Sprintf("%s:%d", in.PrevOut.TxHash, in.PrevOut.Index)
            utxo := s.UTXO[key]
            tin += utxo.Amount
        }
        for _, o := range tx.Outputs { tout += o.Amount }
        if tin > tout { fees += (tin - tout) }
    }

    blk := Block{
        Header: BlockHeader{
            Version:    1,
            PrevHash:   s.Tip.Hash,
            MerkleRoot: "COINBASE_ONLY",
            Time:       time.Now().Unix(),
            NBits:      s.Tip.Header.NBits,
            Nonce:      0,
        },
        Coinbase: reward + fees,
        Miner:    miner,
        Height:   height,
        Hash:     fmt.Sprintf("HASH_%d", height),
        Transactions: included,
    }

    s.Tip = blk
    ensureStateMaps(&s)
    // apply mempool txs to UTXO set
    for _, tx := range included {
        // spend inputs
        for _, in := range tx.Inputs {
            _ = spendUTXO(&s, in.PrevOut)
        }
        // add outputs
        h := tx.Hash
        if h == "" { h = txHash(tx) }
        for i, o := range tx.Outputs {
            addUTXO(&s, h, i, o)
        }
    }
    // credit coinbase as UTXO too
    cbTx := Transaction{Inputs: nil, Outputs: []TxOut{{Address: miner, Amount: reward + fees}}}
    cbHash := txHash(cbTx)
    addUTXO(&s, cbHash, 0, cbTx.Outputs[0])
    s.Balances[miner] = s.Balances[miner] + reward + fees
    buf, _ := json.MarshalIndent(s, "", "  ")
    return ioutil.WriteFile(filepath.FromSlash("bitfuture-coin/data/chain.json"), buf, 0o644)
}

func status() error {
    s, err := loadState()
    if err != nil {
        return err
    }
    fmt.Printf("Tip: height=%d hash=%s time=%d subsidy=%.8f\n", s.Tip.Height, s.Tip.Hash, s.Tip.Header.Time, s.Tip.Coinbase)
    if len(s.Balances) > 0 {
        fmt.Println("Balances:")
        for addr, bal := range s.Balances {
            fmt.Printf("  %s: %.8f\n", addr, bal)
        }
    }
    return nil
}

// ---------------- Wallet ----------------

type WalletEntry struct {
    Address       string `json:"address"`
    PublicKeyHex  string `json:"publicKeyHex"`
    PrivateKeyHex string `json:"privateKeyHex"`
}

type Wallet struct {
    Keys []WalletEntry `json:"keys"`
}

func walletPath() string {
    os.MkdirAll(filepath.FromSlash("bitfuture-coin/wallets"), 0o755)
    return filepath.FromSlash("bitfuture-coin/wallets/keys.json")
}

func loadWallet() (Wallet, error) {
    var w Wallet
    b, err := ioutil.ReadFile(walletPath())
    if err != nil {
        if os.IsNotExist(err) {
            return Wallet{Keys: []WalletEntry{}}, nil
        }
        return w, err
    }
    if err := json.Unmarshal(b, &w); err != nil {
        return w, err
    }
    return w, nil
}

func saveWallet(w Wallet) error {
    buf, _ := json.MarshalIndent(w, "", "  ")
    return ioutil.WriteFile(walletPath(), buf, 0o600)
}

var b58Alphabet = []byte("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

func base58Encode(input []byte) string {
    // Simple base58 encode
    x := make([]byte, len(input))
    copy(x, input)
    var result []byte
    for len(x) > 0 {
        var remainder int
        var newX []byte
        for _, b := range x {
            acc := int(b) + remainder*256
            div := acc / 58
            remainder = acc % 58
            if len(newX) > 0 || div != 0 {
                newX = append(newX, byte(div))
            }
        }
        result = append([]byte{b58Alphabet[remainder]}, result...)
        x = newX
    }
    // handle leading zeros
    for i := 0; i < len(input) && input[i] == 0; i++ {
        result = append([]byte{b58Alphabet[0]}, result...)
    }
    return string(result)
}

func addressFromPub(pub ed25519.PublicKey) string {
    h := sha256.Sum256(pub)
    // take first 20 bytes as payload
    payload := h[:20]
    return "BFC" + base58Encode(payload)
}

func walletNew() error {
    w, _ := loadWallet()
    pub, priv, err := ed25519.GenerateKey(nil)
    if err != nil { return err }
    addr := addressFromPub(pub)
    entry := WalletEntry{
        Address: addr,
        PublicKeyHex: hex.EncodeToString(pub),
        PrivateKeyHex: hex.EncodeToString(priv),
    }
    w.Keys = append(w.Keys, entry)
    if err := saveWallet(w); err != nil { return err }
    fmt.Printf("New address: %s\n", addr)
    return nil
}

func walletList() error {
    w, _ := loadWallet()
    if len(w.Keys) == 0 {
        fmt.Println("No keys in wallet. Run 'bfc wallet new'")
        return nil
    }
    for i, k := range w.Keys {
        fmt.Printf("%d) %s\n", i+1, k.Address)
    }
    return nil
}

func walletBalance(addr string) error {
    s, err := loadState()
    if err != nil { return err }
    bal := s.Balances[addr]
    fmt.Printf("%s: %.8f\n", addr, bal)
    return nil
}

func txSend(from, to string, amount float64) error {
    if amount <= 0 { return fmt.Errorf("amount must be > 0") }
    s, err := loadState(); if err != nil { return err }
    ensureStateMaps(&s)
    // gather UTXOs
    sum, picks, err := findSpendable(&s, from, amount)
    if err != nil { return err }
    change := sum - amount
    // find key
    w, _ := loadWallet()
    var priv ed25519.PrivateKey
    var pub ed25519.PublicKey
    found := false
    for _, k := range w.Keys {
        if k.Address == from {
            pb, _ := hex.DecodeString(k.PublicKeyHex)
            pr, _ := hex.DecodeString(k.PrivateKeyHex)
            pub = ed25519.PublicKey(pb)
            priv = ed25519.PrivateKey(pr)
            found = true
            break
        }
    }
    if !found { return fmt.Errorf("private key for address not found in wallet") }
    // build outputs
    outputs := []TxOut{{Address: to, Amount: amount}}
    if change > 1e-12 { outputs = append(outputs, TxOut{Address: from, Amount: change}) }
    // build inputs
    inputs := make([]TxIn, len(picks))
    for i, op := range picks { inputs[i] = TxIn{PrevOut: op} }
    tx := Transaction{Inputs: inputs, Outputs: outputs}
    // sign each input
    digest, _ := json.Marshal(Transaction{Inputs: tx.Inputs, Outputs: tx.Outputs})
    sig := ed25519.Sign(priv, digest)
    for i := range tx.Inputs {
        tx.Inputs[i].SignatureHex = hex.EncodeToString(sig)
        tx.Inputs[i].PubKeyHex = hex.EncodeToString(pub)
    }
    tx.Hash = txHash(tx)
    // verify and add to mempool
    if err := verifyTx(&s, &tx); err != nil { return err }
    s.Mempool = append(s.Mempool, tx)
    // persist
    buf, _ := json.MarshalIndent(s, "", "  ")
    if err := ioutil.WriteFile(filepath.FromSlash("bitfuture-coin/data/chain.json"), buf, 0o644); err != nil { return err }
    fmt.Printf("tx queued: %s (inputs=%d outputs=%d)\n", tx.Hash, len(tx.Inputs), len(tx.Outputs))
    return nil
}

// ---------------- Minimal RPC ----------------

func startRPC(addr string) error {
    mux := http.NewServeMux()
    mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
        s, err := loadState()
        if err != nil { http.Error(w, err.Error(), 500); return }
        _ = json.NewEncoder(w).Encode(s.Tip)
    })
    mux.HandleFunc("/balance", func(w http.ResponseWriter, r *http.Request) {
        q := r.URL.Query().Get("address")
        if q == "" { http.Error(w, "address required", 400); return }
        s, err := loadState(); if err != nil { http.Error(w, err.Error(), 500); return }
        bal := s.Balances[q]
        _ = json.NewEncoder(w).Encode(map[string]interface{}{"address": q, "balance": bal})
    })
    mux.HandleFunc("/mempool", func(w http.ResponseWriter, r *http.Request) {
        s, err := loadState(); if err != nil { http.Error(w, err.Error(), 500); return }
        _ = json.NewEncoder(w).Encode(s.Mempool)
    })
    mux.HandleFunc("/wallet/new", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "POST only", 405); return }
        if err := walletNew(); err != nil { http.Error(w, err.Error(), 500); return }
        w.WriteHeader(201)
    })
    mux.HandleFunc("/wallet/list", func(w http.ResponseWriter, r *http.Request) {
        wlt, _ := loadWallet()
        _ = json.NewEncoder(w).Encode(wlt.Keys)
    })
    mux.HandleFunc("/tx/send", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "POST only", 405); return }
        var req struct{ From, To string; Amount float64 }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil { http.Error(w, "bad json", 400); return }
        if req.From == "" || req.To == "" || req.Amount <= 0 { http.Error(w, "from,to,amount required", 400); return }
        if err := txSend(req.From, req.To, req.Amount); err != nil { http.Error(w, err.Error(), 400); return }
        w.WriteHeader(202)
    })
    mux.HandleFunc("/mine", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "POST only", 405); return }
        var req struct{ Address string }
        _ = json.NewDecoder(r.Body).Decode(&req)
        if err := mineOnce(req.Address); err != nil { http.Error(w, err.Error(), 500); return }
        _ = json.NewEncoder(w).Encode(map[string]string{"status":"mined"})
    })
    log.Printf("RPC listening on %s", addr)
    return http.ListenAndServe(addr, mux)
}

func main() {
    if len(os.Args) < 2 {
        fmt.Println("usage: bfc [init|mine|status|wallet|tx|rpc]")
        os.Exit(1)
    }
    switch os.Args[1] {
    case "init":
        if err := initChain(); err != nil {
            panic(err)
        }
        fmt.Println("initialized chain: bitfuture-coin/data/chain.json")
    case "mine":
        fs := flag.NewFlagSet("mine", flag.ExitOnError)
        addr := fs.String("address", "", "address to credit; default: first wallet address")
        _ = fs.Parse(os.Args[2:])
        // Allow empty to auto-pick wallet[0]
        if err := mineOnce(*addr); err != nil {
            panic(err)
        }
        fmt.Println("mined 1 block")
    case "status":
        if err := status(); err != nil {
            panic(err)
        }
    case "wallet":
        if len(os.Args) < 3 {
            fmt.Println("usage: bfc wallet [new|list|balance]")
            os.Exit(1)
        }
        switch os.Args[2] {
        case "new":
            if err := walletNew(); err != nil { panic(err) }
        case "list":
            if err := walletList(); err != nil { panic(err) }
        case "balance":
            fs := flag.NewFlagSet("balance", flag.ExitOnError)
            addr := fs.String("address", "", "address to query")
            _ = fs.Parse(os.Args[3:])
            if *addr == "" { panic(errors.New("--address required")) }
            if err := walletBalance(*addr); err != nil { panic(err) }
        default:
            fmt.Println("usage: bfc wallet [new|list|balance]")
            os.Exit(1)
        }
    case "tx":
        if len(os.Args) < 3 { fmt.Println("usage: bfc tx send --from A --to B --amount X"); os.Exit(1) }
        switch os.Args[2] {
        case "send":
            fs := flag.NewFlagSet("send", flag.ExitOnError)
            from := fs.String("from", "", "sender address")
            to := fs.String("to", "", "recipient address")
            amount := fs.Float64("amount", 0, "amount")
            _ = fs.Parse(os.Args[3:])
            if *from == "" || *to == "" || *amount <= 0 { panic(errors.New("--from, --to, --amount required")) }
            if err := txSend(*from, *to, *amount); err != nil { panic(err) }
        default:
            fmt.Println("usage: bfc tx send --from A --to B --amount X")
            os.Exit(1)
        }
    case "rpc":
        fs := flag.NewFlagSet("rpc", flag.ExitOnError)
        listen := fs.String("listen", ":18444", "address to listen on")
        _ = fs.Parse(os.Args[2:])
        if err := startRPC(*listen); err != nil { panic(err) }
    default:
        fmt.Println("unknown command")
        os.Exit(1)
    }
}

