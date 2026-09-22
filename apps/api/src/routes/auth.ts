import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '@ai-support/database';
import { config } from '../config';

const router = Router();

// POST /auth/register — şirket + kullanıcı oluştur
router.post('/register', async (req, res, next) => {
  const { company_name, email, password } = req.body;

  if (!company_name || typeof company_name !== 'string' || company_name.trim().length < 2) {
    res.status(400).json({ success: false, error: 'company_name is required (min 2 chars)' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, error: 'Valid email is required' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const pool = getPool();

    // E-posta zaten kayıtlı mı?
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, error: 'This email is already registered' });
      return;
    }

    // API key üret
    const rawKey = `sk-${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // Şirketi oluştur
    const companyResult = await pool.query(
      `INSERT INTO companies (name, api_key_hash, is_active)
       VALUES ($1, $2, true) RETURNING id, name`,
      [company_name.trim(), keyHash]
    );
    const company = companyResult.rows[0];

    // Şifreyi hash'le ve kullanıcıyı oluştur
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (company_id, email, password_hash) VALUES ($1, $2, $3)`,
      [company.id, email.toLowerCase(), passwordHash]
    );

    // JWT üret
    const token = jwt.sign(
      { companyId: company.id, email: email.toLowerCase() },
      config.auth.jwtSecret,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      data: {
        token,
        company: { id: company.id, name: company.name },
        api_key: rawKey, // sadece kayıtta bir kez gösterilir
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'email and password are required' });
    return;
  }

  try {
    const pool = getPool();

    const result = await pool.query(
      `SELECT u.id, u.password_hash, u.company_id, c.name as company_name, c.is_active
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      res.status(403).json({ success: false, error: 'Account is deactivated' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign(
      { companyId: user.company_id, email: email.toLowerCase() },
      config.auth.jwtSecret,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      data: {
        token,
        company: { id: user.company_id, name: user.company_name },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
