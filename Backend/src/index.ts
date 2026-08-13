import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import prisma from './prismaClient';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from './middleware/auth';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'TradeSim backend is running' });
});

// Signup route
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        portfolio: {
          create: {
            cashBalance: 100000,
          },
        },
      },
      include: { portfolio: true },
    });

    res.status(201).json({
      message: 'User created successfully',
      user: { id: user.id, email: user.email, portfolio: user.portfolio },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Login route
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.json({ message: 'Login successful', token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.get('/portfolio/me', authenticateToken, async (req: AuthRequest, res) => {
  const portfolio = await prisma.portfolio.findUnique({
    where: { userId: req.userId },
    include: { holdings: true },
  });
  res.json(portfolio);
});
app.post('/trades/buy', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { symbol, quantity, price } = req.body;

    if (!symbol || !quantity || !price || quantity <= 0 || price <= 0) {
      return res.status(400).json({ error: 'Valid symbol, quantity, and price are required' });
    }

    const portfolio = await prisma.portfolio.findUnique({ where: { userId: req.userId } });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const cost = quantity * price;
    if (cost > portfolio.cashBalance) {
      return res.status(400).json({ error: 'Insufficient cash balance' });
    }

    // Run as a transaction: all steps succeed together, or none do
    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct cash
      const updatedPortfolio = await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { cashBalance: portfolio.cashBalance - cost },
      });

      // 2. Update or create holding
      const existingHolding = await tx.holding.findFirst({
        where: { portfolioId: portfolio.id, symbol },
      });

      if (existingHolding) {
        const newQuantity = existingHolding.quantity + quantity;
        const newAvgPrice =
          (existingHolding.avgBuyPrice * existingHolding.quantity + cost) / newQuantity;
        await tx.holding.update({
          where: { id: existingHolding.id },
          data: { quantity: newQuantity, avgBuyPrice: newAvgPrice },
        });
      } else {
        await tx.holding.create({
          data: { portfolioId: portfolio.id, symbol, quantity, avgBuyPrice: price },
        });
      }

      // 3. Log transaction
      await tx.transaction.create({
        data: { portfolioId: portfolio.id, symbol, type: 'BUY', quantity, price },
      });

      return updatedPortfolio;
    });

    res.json({ message: 'Buy order executed', cashBalance: result.cashBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
app.post('/trades/sell', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { symbol, quantity, price } = req.body;

    if (!symbol || !quantity || !price || quantity <= 0 || price <= 0) {
      return res.status(400).json({ error: 'Valid symbol, quantity, and price are required' });
    }

    const portfolio = await prisma.portfolio.findUnique({ where: { userId: req.userId } });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const holding = await prisma.holding.findFirst({
      where: { portfolioId: portfolio.id, symbol },
    });

    if (!holding || holding.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient shares to sell' });
    }

    const proceeds = quantity * price;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Add cash from sale
      const updatedPortfolio = await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { cashBalance: portfolio.cashBalance + proceeds },
      });

      // 2. Reduce or remove holding
      const remainingQuantity = holding.quantity - quantity;
      if (remainingQuantity === 0) {
        await tx.holding.delete({ where: { id: holding.id } });
      } else {
        await tx.holding.update({
          where: { id: holding.id },
          data: { quantity: remainingQuantity },
        });
      }

      // 3. Log transaction
      await tx.transaction.create({
        data: { portfolioId: portfolio.id, symbol, type: 'SELL', quantity, price },
      });

      return updatedPortfolio;
    });

    res.json({ message: 'Sell order executed', cashBalance: result.cashBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
app.get('/market/quote/:symbol', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { symbol } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
    );
    const data = await response.json();

    if (!data || data.c === undefined) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    res.json({
      symbol,
      currentPrice: data.c,
      change: data.d,
      percentChange: data.dp,
      high: data.h,
      low: data.l,
      previousClose: data.pc,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});
app.get('/transactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const portfolio = await prisma.portfolio.findUnique({ where: { userId: req.userId } });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const transactions = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { timestamp: 'desc' },
    });

    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});