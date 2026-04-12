import React, { useState } from 'react';
import { Lock } from 'lucide-react';

export default function PasswordStrength() {
  const [password, setPassword] = useState('');
  const [score, setScore] = useState(0);

  const calculateStrength = (pwd: string) => {
    setPassword(pwd);
    let s = 0;
    if (pwd.length > 5) s += 1;
    if (pwd.length > 10) s += 1;
    if (pwd.length > 15) s += 1;
    if (/[A-Z]/.test(pwd)) s += 1;
    if (/[a-z]/.test(pwd)) s += 1;
    if (/[0-9]/.test(pwd)) s += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) s += 2;
    setScore(Math.min(s, 5));
  };

  const getStrengthLabel = () => {
    if (score <= 1) return { label: 'Very Weak', color: 'text-red-600', bg: 'bg-red-500' };
    if (score === 2) return { label: 'Weak', color: 'text-orange-600', bg: 'bg-orange-500' };
    if (score === 3) return { label: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-500' };
    if (score === 4) return { label: 'Strong', color: 'text-green-500', bg: 'bg-green-500' };
    return { label: 'Very Strong', color: 'text-green-700', bg: 'bg-green-700' };
  };

  const strength = getStrengthLabel();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Password Strength Checker</h1>
        <p className="text-xl text-gray-600">Test how strong your PDF password is before setting it.</p>
      </div>

      <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
            <Lock className="w-8 h-8" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-gray-900">Check Your Password</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => calculateStrength(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Enter password..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Strength:</span>
              <span className={`font-bold ${strength.color}`}>{password.length === 0 ? 'None' : strength.label}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${password.length === 0 ? 'w-0' : strength.bg} transition-all duration-300`} 
                style={{ width: `${(score / 5) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
