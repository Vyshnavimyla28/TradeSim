import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

function Trade() {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quote, setQuote] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingQuote, setLoadingQuote] = useState(false);
  const navigate = useNavigate();

  const fetchQuote = async () => {
    if (!symbol) return;
    setLoadingQuote(true);
    setError('');
    try {
      const res = await api.get(`/market/quote/${symbol.toUpperCase()}`);
      setQuote(res.data.currentPrice);
    } catch (err) {
      setError('Could not fetch price for that symbol');
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleTrade = async (type: 'buy' | 'sell') => {
    setError('');
    setMessage('');
    if (!quote || !quantity) {
      setError('Fetch a live price and enter a quantity first');
      return;
    }
    try {
      const res = await api.post(`/trades/${type}`, {
        symbol: symbol.toUpperCase(),
        quantity: Number(quantity),
        price: quote,
      });
      setMessage(`${type === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${symbol.toUpperCase()} — new balance: $${res.data.cashBalance.toLocaleString()}`);
      setQuantity('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Trade failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Trade</h1>
        <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white text-sm">
          ← Back to Dashboard
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 max-w-md">
        {error && <div className="bg-red-500/20 text-red-400 text-sm p-2 rounded mb-4">{error}</div>}
        {message && <div className="bg-green-500/20 text-green-400 text-sm p-2 rounded mb-4">{message}</div>}

        <label className="text-slate-400 text-sm">Symbol</label>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="e.g. AAPL"
            value={symbol}
            onChange={(e) => { setSymbol(e.target.value); setQuote(null); }}
            className="flex-1 p-2 rounded bg-slate-700 text-white outline-none focus:ring-2 focus:ring-blue-500 uppercase"
          />
          <button
            onClick={fetchQuote}
            disabled={loadingQuote}
            className="bg-slate-700 hover:bg-slate-600 px-4 rounded text-sm"
          >
            {loadingQuote ? '...' : 'Get Price'}
          </button>
        </div>

        {quote !== null && (
          <p className="text-green-400 mb-4">
            Current price: <span className="font-bold">${quote.toFixed(2)}</span>
          </p>
        )}

        <label className="text-slate-400 text-sm">Quantity</label>
        <input
          type="number"
          min="1"
          placeholder="Number of shares"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full p-2 mb-4 rounded bg-slate-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex gap-3">
          <button
            onClick={() => handleTrade('buy')}
            className="flex-1 bg-green-600 hover:bg-green-700 font-semibold p-2 rounded transition"
          >
            Buy
          </button>
          <button
            onClick={() => handleTrade('sell')}
            className="flex-1 bg-red-600 hover:bg-red-700 font-semibold p-2 rounded transition"
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}

export default Trade;