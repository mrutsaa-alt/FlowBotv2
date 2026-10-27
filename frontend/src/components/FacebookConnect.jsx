
import React, { useState } from 'react';
import { startFacebookLogin } from '../auth/facebookLogin';
import { Localized } from '../i18n';
export default function FacebookConnect() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const connect = async () => {
    setBusy(true); setError('');
    try { await startFacebookLogin(); }
    catch (e) { setError(e.message || 'Facebook connection failed'); }
    finally { setBusy(false); }
  };
  return <Localized><div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-md border border-gray-100">
    <h2 className="text-xl font-bold text-gray-800 mb-2">Connect Facebook Page</h2>
    <p className="text-gray-600 text-sm mb-6 text-center">Connect through FlowBot's server-validated OAuth flow. Configure the Meta App credentials on the backend first.</p>
    {error && <p role="alert" className="text-sm text-red-600 mb-3">{error}</p>}
    <button onClick={connect} disabled={busy} className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">
      {busy ? 'Connecting…' : 'Connect Facebook'}
    </button>
  </div></Localized>;
}
