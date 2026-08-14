import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

interface Holding {
  id: string;
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
}

interface Portfolio {
  cashBalance: number;
  holdings: Holding[];
}

function Dashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await api.get('/portfolio/me');
        setPortfolio(res.data);
      } catch (err) {
        setError('Failed to load portfolio');
      }
    };
    fetchPortfolio();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (error) {
    return <div className="min-h-screen bg-slate-900 text-red-400 p-8">{error}</div>;
  }

  if (!portfolio) {
    return <div className="min-h-screen bg-slate-900 text-white p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
  <h1 className="text-3xl font-bold">TradeSim</h1>
  <button
    onClick={() => navigate('/trade')}
    className="bg-blue-600 hover:bg-blue-700 text-sm px-3 py-1 rounded"
  >
    Trade
  </button>
</div>
        <button
          onClick={handleLogout}
          className="text-slate-400 hover:text-white text-sm"
        >
          Log out
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 mb-6">
        <p className="text-slate-400 text-sm">Cash Balance</p>
        <p className="text-4xl font-bold text-green-400">
          ${portfolio.cashBalance.toLocaleString()}
        </p>
      </div>

      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Holdings</h2>
        {portfolio.holdings.length === 0 ? (
          <p className="text-slate-400">No holdings yet. Start trading!</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400 text-sm border-b border-slate-700">
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Quantity</th>
                <th className="pb-2">Avg Price</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.holdings.map((h) => (
                <tr key={h.id} className="border-b border-slate-700/50">
                  <td className="py-2 font-medium">{h.symbol}</td>
                  <td className="py-2">{h.quantity}</td>
                  <td className="py-2">${h.avgBuyPrice.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Dashboard;