import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Secure Password Hashing & Verification (format: salt:hash:iterations)
export const PBKDF2_ITERATIONS = 100000

export function hashPassword(password, salt = null, iterations = PBKDF2_ITERATIONS) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex')
  }
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
  return `${salt}:${hash}:${iterations}`
}

export function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false
  if (!storedHash.includes(':')) {
    const sha = crypto.createHash('sha256').update(password).digest('hex')
    return sha === storedHash || password === storedHash
  }
  try {
    const parts = storedHash.split(':')
    const salt = parts[0]
    const hash = parts[1]
    const iterations = parts.length >= 3 ? parseInt(parts[2], 10) : 10000
    if (!salt || !hash || isNaN(iterations)) return false
    const calculated = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calculated, 'hex'))
  } catch {
    return false
  }
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export function generateRandomPassword(bytes = 15) {
  // base64url without ambiguous padding; ~20 characters
  return crypto.randomBytes(bytes).toString('base64url')
}

/**
 * Atomically write a file (write temp + rename) with restrictive permissions.
 */
export function writeFileAtomic(filePath, content, mode = 0o600) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode })
  try { fs.chmodSync(tmp, mode) } catch {}
  fs.renameSync(tmp, filePath)
}

export const INITIAL_PASSWORD_FILENAME = 'initial_admin_password'

export function readUsers(usersFile) {
  try {
    if (!fs.existsSync(usersFile)) return []
    const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    // A corrupt users file must never be silently replaced by a fresh admin.
    throw new Error(`无法解析用户文件 ${usersFile}: ${err.message}`)
  }
}

/**
 * First-run administrator initialization.
 *
 * - Runs only when the users file is missing or contains no users.
 * - Never overwrites an existing account.
 * - The generated password is written to <dataDir>/initial_admin_password (0600)
 *   and is NOT printed to the service log.
 * - ARMGUARD_ADMIN_USER / ARMGUARD_ADMIN_PASSWORD may pre-seed the first account.
 */
export function ensureInitialAdmin({ dataDir, usersFile, env = process.env }) {
  const users = readUsers(usersFile)
  if (users.length > 0) {
    return { created: false }
  }

  const username = (env.ARMGUARD_ADMIN_USER || 'admin').trim() || 'admin'
  const providedPassword = env.ARMGUARD_ADMIN_PASSWORD
  const password = providedPassword && providedPassword.length >= 8 ? providedPassword : generateRandomPassword()

  const newUsers = [{
    id: 1,
    username,
    password: hashPassword(password),
    role: 'admin',
    created_at: new Date().toISOString()
  }]
  writeFileAtomic(usersFile, JSON.stringify(newUsers, null, 2), 0o600)

  let passwordFile = null
  if (!providedPassword) {
    passwordFile = path.join(dataDir, INITIAL_PASSWORD_FILENAME)
    writeFileAtomic(passwordFile, `username=${username}\npassword=${password}\n`, 0o600)
  }
  return { created: true, username, passwordFile }
}

/**
 * Local recovery: reset (or create) the administrator password.
 * Intended to be run by root on the panel host only.
 */
export function resetAdminPassword({ dataDir, usersFile, username = null, password = null }) {
  const users = readUsers(usersFile)
  const newPassword = password || generateRandomPassword()
  let user = username ? users.find(u => u.username === username) : users[0]
  if (!user) {
    user = { id: users.length + 1, username: username || 'admin', role: 'admin', created_at: new Date().toISOString() }
    users.push(user)
  }
  user.password = hashPassword(newPassword)
  delete user.password_plain
  writeFileAtomic(usersFile, JSON.stringify(users, null, 2), 0o600)
  const passwordFile = path.join(dataDir, INITIAL_PASSWORD_FILENAME)
  writeFileAtomic(passwordFile, `username=${user.username}\npassword=${newPassword}\n`, 0o600)
  return { username: user.username, password: newPassword, passwordFile }
}
