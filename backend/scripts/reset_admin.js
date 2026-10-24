#!/usr/bin/env node
// ArmGuard local administrator recovery tool.
//
// Usage (on the panel host, as root):
//   sudo node /opt/armguard/backend/scripts/reset_admin.js [--username admin]
//
// Generates a new random password for the administrator (or creates the account
// if none exists), stores it in <data dir>/initial_admin_password (mode 0600) and
// prints it to this terminal only. Restart the service afterwards to drop
// existing sessions:  sudo systemctl restart armguard
import path from 'path'
import { resetAdminPassword } from '../lib/security.js'

const args = process.argv.slice(2)
let username = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--username' && args[i + 1]) {
    username = args[++i]
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log('Usage: node reset_admin.js [--username <name>]')
    process.exit(0)
  }
}

const dataDir = process.env.ARMGUARD_DATA_DIR || '/var/lib/armguard'
const usersFile = path.join(dataDir, 'users.json')

try {
  const result = resetAdminPassword({ dataDir, usersFile, username })
  console.log(`[ArmGuard] Administrator "${result.username}" password has been reset.`)
  console.log(`[ArmGuard] New password: ${result.password}`)
  console.log(`[ArmGuard] Also saved to ${result.passwordFile} (0600). Delete it after you log in and change the password.`)
  console.log('[ArmGuard] Run "systemctl restart armguard" to invalidate existing sessions.')
} catch (err) {
  console.error(`[ArmGuard] Reset failed: ${err.message}`)
  process.exit(1)
}
