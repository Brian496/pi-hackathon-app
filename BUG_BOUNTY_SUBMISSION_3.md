# Bug Bounty Submission #3: Missing Reentrancy Protection in External Calls

## Vulnerability Title
Missing Reentrancy Protection in Functions with External Token Transfers

## Severity
Medium

## Vulnerability Type
Reentrancy Attack

## Affected Contract
- **Contract:** `SSVClusters.sol`
- **Functions:** `liquidate()`, `withdraw()`
- **Lines:** 215, 327

## Vulnerability Description

Functions that perform external token transfers via `CoreLib.transferBalance()` do not implement reentrancy protection, potentially allowing attackers to exploit the contract through reentrancy attacks.

### Vulnerable Code

```solidity
// contracts/modules/SSVClusters.sol:215
CoreLib.transferBalance(msg.sender, balanceLiquidatable);

// contracts/modules/SSVClusters.sol:327
CoreLib.transferBalance(msg.sender, amount);
```

### Context

```solidity
function liquidate(address clusterOwner, uint64[] calldata operatorIds, Cluster memory cluster) external override {
    StorageData storage s = SSVStorage.load();
    StorageProtocol storage sp = SSVStorageProtocol.load();

    bytes32 hashedCluster = cluster.validateHashedCluster(clusterOwner, operatorIds, s);

    if (
        !cluster.isLiquidatable(
            burnRate,
            sp.networkFee,
            sp.minimumBlocksBeforeLiquidation,
            sp.minimumLiquidationCollateral
        )
    ) {
        revert ClusterNotLiquidatable();
    }

    sp.updateDAO(false, cluster.validatorCount);

    if (cluster.balance != 0) {
        balanceLiquidatable = cluster.balance;
        cluster.balance = 0;
    }

    CoreLib.transferBalance(msg.sender, balanceLiquidatable); // VULNERABLE LINE

    s.clusters[hashedCluster] = cluster.hashClusterData();

    emit ClusterLiquidated(msg.sender, operatorIds, cluster);
}
```

## Impact

1. **Reentrancy Attacks:** Attackers could call back into the contract before state updates complete
2. **Double Spending:** Multiple withdrawals could be processed before balance updates
3. **State Manipulation:** Contract state could be manipulated through recursive calls
4. **Fund Drainage:** Potential for unauthorized fund extraction

## Proof of Concept

### Attack Scenario: Malicious Token Contract

```solidity
// Malicious token contract that implements reentrancy
contract MaliciousToken is IERC20 {
    SSVClusters public ssvContract;
    bool private attacking = false;
    
    function attack() external {
        // Trigger liquidation or withdrawal
        ssvContract.liquidate(/* parameters */);
    }
    
    function transfer(address to, uint256 amount) external override returns (bool) {
        if (attacking && msg.sender == address(ssvContract)) {
            attacking = false;
            // Reenter the contract before state is updated
            ssvContract.liquidate(/* same parameters */);
        }
        return true;
    }
}
```

### Attack Flow

1. Attacker calls `liquidate()` or `withdraw()`
2. Contract calls `CoreLib.transferBalance()`
3. If token is malicious, it calls back into the contract
4. State hasn't been updated yet, allowing multiple operations
5. Attacker can drain funds or manipulate state

## Recommended Fix

### Option 1: Add ReentrancyGuard

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SSVClusters is ISSVClusters, ReentrancyGuard {
    
    function liquidate(address clusterOwner, uint64[] calldata operatorIds, Cluster memory cluster) 
        external 
        override 
        nonReentrant 
    {
        // ... existing code ...
        
        uint256 balanceLiquidatable = cluster.balance;
        cluster.balance = 0;
        
        // Update state before external call
        s.clusters[hashedCluster] = cluster.hashClusterData();
        
        // External call after state update
        CoreLib.transferBalance(msg.sender, balanceLiquidatable);
        
        emit ClusterLiquidated(msg.sender, operatorIds, cluster);
    }
}
```

### Option 2: Checks-Effects-Interactions Pattern

```solidity
function liquidate(address clusterOwner, uint64[] calldata operatorIds, Cluster memory cluster) external override {
    // CHECKS
    // ... validation logic ...
    
    // EFFECTS
    uint256 balanceLiquidatable = cluster.balance;
    cluster.balance = 0;
    s.clusters[hashedCluster] = cluster.hashClusterData();
    
    // INTERACTIONS (external calls last)
    CoreLib.transferBalance(msg.sender, balanceLiquidatable);
    
    emit ClusterLiquidated(msg.sender, operatorIds, cluster);
}
```

### Option 3: Pull Payment Pattern

```solidity
// Instead of pushing payments, use pull pattern
mapping(address => uint256) public pendingWithdrawals;

function liquidate(address clusterOwner, uint64[] calldata operatorIds, Cluster memory cluster) external override {
    // ... validation logic ...
    
    uint256 balanceLiquidatable = cluster.balance;
    cluster.balance = 0;
    
    // Store withdrawal instead of immediate transfer
    pendingWithdrawals[msg.sender] += balanceLiquidatable;
    
    s.clusters[hashedCluster] = cluster.hashClusterData();
    
    emit ClusterLiquidated(msg.sender, operatorIds, cluster);
}

function withdrawFunds() external {
    uint256 amount = pendingWithdrawals[msg.sender];
    require(amount > 0, "No funds to withdraw");
    
    pendingWithdrawals[msg.sender] = 0;
    CoreLib.transferBalance(msg.sender, amount);
}
```

## Additional Affected Locations

Similar vulnerabilities exist in:
- `SSVOperators.sol` - `_transferOperatorBalanceUnsafe()` function
- `SSVDAO.sol` - `withdrawNetworkEarnings()` function
- Any other function that makes external calls after state changes

## Verification Steps

1. Deploy a malicious token contract that implements reentrancy
2. Set up a scenario where liquidation/withdrawal can be triggered
3. Execute the attack to demonstrate multiple withdrawals
4. Verify that funds can be drained or state manipulated

## References

- [Reentrancy Attack](https://consensys.net/diligence/attacks/reentrancy/)
- [OpenZeppelin ReentrancyGuard](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard)
- [Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)

## Disclosure Timeline

- **Discovery Date:** July 22, 2025
- **Report Date:** July 22, 2025
- **Status:** Ready for submission

---

**Note:** The exploitability of this vulnerability depends on the specific token implementation used. If the SSV token is a standard ERC20 without malicious callbacks, the risk may be lower, but it's still a best practice to implement protection. 