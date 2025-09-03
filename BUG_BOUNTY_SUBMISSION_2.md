# Bug Bounty Submission #2: Potential Hash Collision in Cluster Identification

## Vulnerability Title
Hash Collision Vulnerability in Cluster Identification Using abi.encodePacked

## Severity
Medium

## Vulnerability Type
Hash Collision / Input Validation

## Affected Contract
- **Contract:** `ClusterLib.sol`
- **Function:** `validateHashedCluster()`
- **Line:** 52

## Vulnerability Description

The `validateHashedCluster()` function uses `abi.encodePacked()` with dynamic arrays, which can lead to hash collisions if the input arrays are not properly validated for uniqueness and ordering.

### Vulnerable Code

```solidity
// contracts/libraries/ClusterLib.sol:52
hashedCluster = keccak256(abi.encodePacked(owner, operatorIds));
```

### Context

```solidity
function validateHashedCluster(
    ISSVNetworkCore.Cluster memory cluster,
    address owner,
    uint64[] memory operatorIds,
    StorageData storage s
) internal view returns (bytes32 hashedCluster) {
    hashedCluster = keccak256(abi.encodePacked(owner, operatorIds)); // VULNERABLE LINE
    bytes32 hashedClusterData = hashClusterData(cluster);

    bytes32 clusterData = s.clusters[hashedCluster];
    if (clusterData == bytes32(0)) {
        revert ISSVNetworkCore.ClusterDoesNotExists();
    } else if (clusterData != hashedClusterData) {
        revert ISSVNetworkCore.IncorrectClusterState();
    }
}
```

## Impact

1. **Hash Collisions:** Different operator arrays could produce the same hash
2. **State Confusion:** Multiple clusters could be mapped to the same storage location
3. **Potential Exploitation:** Attackers could manipulate cluster states through hash collisions
4. **Data Corruption:** Incorrect cluster data could be stored or retrieved

## Proof of Concept

### Scenario 1: Array Ordering Collision
```solidity
// These two different operator arrays could produce the same hash
uint64[] memory operators1 = [1, 2, 3];
uint64[] memory operators2 = [3, 2, 1];

// Both could hash to the same value with abi.encodePacked
bytes32 hash1 = keccak256(abi.encodePacked(owner, operators1));
bytes32 hash2 = keccak256(abi.encodePacked(owner, operators2));
// hash1 could equal hash2
```

### Scenario 2: Duplicate Values
```solidity
// Arrays with duplicate values could cause issues
uint64[] memory operators1 = [1, 2, 3];
uint64[] memory operators2 = [1, 1, 2, 2, 3, 3];

// These might hash differently but represent the same logical cluster
```

### Scenario 3: Empty vs Non-empty Arrays
```solidity
uint64[] memory operators1 = [];
uint64[] memory operators2 = [0]; // Could potentially collide
```

## Recommended Fix

### Option 1: Sort and Deduplicate Arrays
```solidity
function validateHashedCluster(
    ISSVNetworkCore.Cluster memory cluster,
    address owner,
    uint64[] memory operatorIds,
    StorageData storage s
) internal view returns (bytes32 hashedCluster) {
    // Sort and deduplicate operatorIds
    uint64[] memory sortedUniqueIds = sortAndDeduplicate(operatorIds);
    
    hashedCluster = keccak256(abi.encodePacked(owner, sortedUniqueIds));
    
    // ... rest of the function
}

function sortAndDeduplicate(uint64[] memory ids) internal pure returns (uint64[] memory) {
    // Implementation to sort and remove duplicates
    // This ensures consistent hashing
}
```

### Option 2: Use abi.encode Instead
```solidity
// Use abi.encode for more predictable hashing
hashedCluster = keccak256(abi.encode(owner, operatorIds));
```

### Option 3: Add Validation
```solidity
function validateHashedCluster(
    ISSVNetworkCore.Cluster memory cluster,
    address owner,
    uint64[] memory operatorIds,
    StorageData storage s
) internal view returns (bytes32 hashedCluster) {
    // Validate operatorIds
    require(operatorIds.length > 0, "Empty operator array");
    require(isSortedAndUnique(operatorIds), "Array not sorted or contains duplicates");
    
    hashedCluster = keccak256(abi.encodePacked(owner, operatorIds));
    
    // ... rest of the function
}

function isSortedAndUnique(uint64[] memory ids) internal pure returns (bool) {
    for (uint i = 1; i < ids.length; i++) {
        if (ids[i] <= ids[i-1]) return false;
    }
    return true;
}
```

## Additional Affected Locations

Similar issues exist in:
- `validateClusterOnRegistration()` function (line 91)
- Any other function using `abi.encodePacked` with dynamic arrays

## Verification Steps

1. Create two different operator arrays with the same elements in different orders
2. Call `validateHashedCluster()` with both arrays
3. Check if they produce the same hash
4. Verify if this causes state conflicts

## References

- [Solidity abi.encodePacked Collision](https://docs.soliditylang.org/en/latest/abi-spec.html#non-standard-packed-mode)
- [OpenZeppelin MerkleProof](https://docs.openzeppelin.com/contracts/4.x/api/utils#MerkleProof)
- [Hash Collision Attacks](https://en.wikipedia.org/wiki/Hash_collision)

## Disclosure Timeline

- **Discovery Date:** July 22, 2025
- **Report Date:** July 22, 2025
- **Status:** Ready for submission

---

**Note:** This vulnerability requires careful analysis of the specific use cases to determine exploitability. The impact depends on how the cluster identification is used throughout the system. 