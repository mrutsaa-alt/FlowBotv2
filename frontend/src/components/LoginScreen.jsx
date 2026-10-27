import React, { useState, useEffect } from 'react';
import { Mail, LockKeyhole, UserRound, Globe, Zap, Eye, EyeOff, Chrome, Facebook, Send, ShieldCheck, ArrowRight, Moon, Sun } from 'lucide-react';
import { useLang, setLang } from '../i18n';
import { Localized } from '../i18n';

const getSavedTheme = () => {
  try { return localStorage.getItem('flowbot_theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
};
const facebookLoginExchanges = new Map();
const exchangeFacebookLoginCode = code => {
  if (facebookLoginExchanges.has(code)) return facebookLoginExchanges.get(code);
  const exchange = fetch(`${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/auth/facebook-login/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token || !data.user) throw new Error(data.error || 'Facebook sign-in could not be completed. Please try again.');
    return data;
  });
  facebookLoginExchanges.set(code, exchange);
  exchange.then(() => facebookLoginExchanges.delete(code), () => facebookLoginExchanges.delete(code));
  return exchange;
};

const dict = {
  en: {
    welcome: 'Welcome back', sub: 'Sign in to continue to your Flowbot workspace.', email: 'Email address', password: 'Password', name: 'Full name',
    signin: 'Sign in', signup: 'Create account', toggleIn: 'Already have an account?', toggleUp: 'New to Flowbot?',
    hint: 'Your password is securely hashed.', error: 'Unable to sign in', min: 'Password must contain at least 6 characters.',
    or: 'or continue with', socialNote: 'Sign in with Facebook or use your email and password. Google and Telegram sign-in are not enabled yet.',
    comingSoon: (provider) => `${provider} sign-in is coming soon. For now, please use email and password.`,
    facebookAccountExists: 'An account already uses this email. Sign in with email first; Facebook accounts are not linked automatically.', facebookEmailRequired: 'Facebook did not provide an email address. Allow email permission and try again.', facebookCancelled: 'Facebook sign-in was cancelled.', facebookNotConfigured: 'Facebook sign-in is not configured on the server.', facebookFailed: 'Facebook sign-in could not be completed. Please try again.',
    facebookTokenExchangeFailed: 'Facebook rejected the login callback. Check the App Secret and exact Valid OAuth Redirect URI in Meta settings.', facebookProfileFailed: 'Flowbot could not read your Facebook profile. Check the email permission and App Tester role.',
    google: 'Google', facebook: 'Facebook', telegram: 'Telegram', secure: 'Secure workspace access', noAccount: 'One workspace for every conversation.',
  },
  bn: {
    welcome: 'আবার স্বাগতম', sub: 'আপনার Flowbot ওয়ার্কস্পেসে প্রবেশ করতে সাইন ইন করুন।', email: 'ইমেইল ঠিকানা', password: 'পাসওয়ার্ড', name: 'পূর্ণ নাম',
    signin: 'সাইন ইন', signup: 'অ্যাকাউন্ট তৈরি করুন', toggleIn: 'আগে থেকেই অ্যাকাউন্ট আছে?', toggleUp: 'Flowbot-এ নতুন?',
    hint: 'আপনার পাসওয়ার্ড নিরাপদভাবে হ্যাশ করা হয়।', error: 'সাইন ইন করা যায়নি', min: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
    or: 'অথবা এভাবে চালিয়ে যান', socialNote: 'Facebook দিয়ে সাইন ইন করুন অথবা ইমেইল ও পাসওয়ার্ড ব্যবহার করুন। Google ও Telegram সাইন ইন এখনো চালু হয়নি।',
    facebookAccountExists: 'এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে। আগে ইমেইল দিয়ে সাইন ইন করুন; নিরাপত্তার জন্য Facebook account নিজে থেকে link করা হবে না।', facebookEmailRequired: 'Facebook থেকে ইমেইল পাওয়া যায়নি। Email permission দিয়ে আবার চেষ্টা করুন।', facebookCancelled: 'Facebook sign-in বাতিল করা হয়েছে।', facebookNotConfigured: 'সার্ভারে Facebook sign-in configure করা নেই।', facebookFailed: 'Facebook sign-in সম্পন্ন হয়নি। আবার চেষ্টা করুন।',
    facebookTokenExchangeFailed: 'Facebook callback গ্রহণ করেনি। Meta settings-এর App Secret ও হুবহু Valid OAuth Redirect URI যাচাই করুন।', facebookProfileFailed: 'Flowbot Facebook profile পড়তে পারেনি। Email permission ও App Tester role যাচাই করুন।',
    google: 'Google', facebook: 'Facebook', telegram: 'Telegram', secure: 'নিরাপদ ওয়ার্কস্পেস অ্যাক্সেস', noAccount: 'সব কথোপকথনের জন্য একটি ওয়ার্কস্পেস।',
  },
};

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [providerMessage, setProviderMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState(getSavedTheme);
  const { lang, t } = useLang(dict);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('flowbot_theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('facebook_login_code');
    const oauthError = url.searchParams.get('facebook_login_error');
    if (!code && !oauthError) return;
    const clearOAuthParams = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('facebook_login_code');
      cleanUrl.searchParams.delete('facebook_login_error');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    };
    if (oauthError) {
      clearOAuthParams();
      const errorKeys = {
        account_exists: 'facebookAccountExists',
        email_required: 'facebookEmailRequired',
        cancelled: 'facebookCancelled',
        not_configured: 'facebookNotConfigured',
        token_exchange_failed: 'facebookTokenExchangeFailed',
        profile_failed: 'facebookProfileFailed',
      };
      const errorKey = errorKeys[oauthError] || 'facebookFailed';
      setError(t(errorKey));
      return;
    }
    let active = true;
    setBusy(true);
    exchangeFacebookLoginCode(code).then(data => {
      if (!active) return;
      clearOAuthParams();
      onLogin(data);
    }).catch(err => {
      if (!active) return;
      clearOAuthParams();
      setError(err.message || t('facebookFailed'));
    })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (register && password.length < 6) { setError(t('min')); return; }
    setBusy(true);
    try {
      const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${base}/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }),
      });
      const contentType = response.headers.get('content-type') || '';
      let data = {};
      if (contentType.includes('application/json')) data = await response.json().catch(() => ({}));
      else {
        const text = (await response.text().catch(() => '')).trim();
        data = { error: /^\s*(?:<!doctype\s+html|<html\b|<body\b)/i.test(text) ? '' : text.slice(0, 180) };
      }
      if (!response.ok) throw new Error(data.error || (response.status === 502 || response.status === 503 ? 'The server or database is unavailable. Check the backend and database logs.' : `Request failed (HTTP ${response.status}).`));
      if (!data.token || !data.user) throw new Error(data.error || 'The server returned an invalid login response. Check the backend /api/auth endpoint.');
      onLogin(data);
    } catch (err) { setError(err.message || t('error')); }
    finally { setBusy(false); }
  };

  const providerNotReady = (provider) => setProviderMessage(t('comingSoon')(provider));
  const facebookLogin = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/auth/facebook-login-url`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || t('facebookFailed'));
      window.location.assign(data.url);
    } catch (err) { setError(err.message || t('facebookFailed')); setBusy(false); }
  };

  return (
    <Localized><div className="auth-page">
      <aside className="auth-visual">
        <div className="auth-brand"><span className="auth-brand-mark"><Zap size={21} fill="currentColor" /></span><span>Flowbot</span></div>
        <div className="auth-visual-copy">
          <span className="auth-kicker"><span /> CUSTOMER ENGAGEMENT PLATFORM</span>
          <h2>Make every conversation <em>count.</em></h2>
          <p>Bring your messages, contacts, and automations together in one workspace.</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-top"><span className="auth-preview-dot"/><span className="auth-preview-dot"/><span className="auth-preview-dot"/><span className="auth-preview-label">FLOW OVERVIEW</span></div>
            <div className="auth-flow-row"><span className="auth-flow-icon trigger"><Zap size={17}/></span><div><b>New subscriber</b><small>Trigger · When a contact joins</small></div><span className="auth-flow-check">✓</span></div>
            <div className="auth-flow-line" />
            <div className="auth-flow-row"><span className="auth-flow-icon message"><Send size={17}/></span><div><b>Send welcome message</b><small>Action · Automated response</small></div><span className="auth-flow-check">✓</span></div>
            <div className="auth-preview-footer"><span><span className="auth-online-dot"/> Workflow ready</span><span>2 steps</span></div>
          </div>
        </div>
        <div className="auth-visual-footer"><ShieldCheck size={16}/> Built for teams that value secure access</div>
      </aside>

      <main className="auth-main">
        <header className="auth-topbar">
          <span className="auth-mobile-brand"><span className="auth-brand-mark"><Zap size={18} fill="currentColor" /></span>Flowbot</span>
          <div className="auth-language-wrap">
            <button type="button" className="auth-language auth-theme-toggle" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}
            </button>
            <button type="button" className="auth-language" onClick={() => setMenu(!menu)} aria-label="Choose language"><Globe size={17}/><span>{lang === 'bn' ? 'বাংলা' : 'English'}</span></button>
            {menu && <div className="auth-language-menu"><button type="button" onClick={() => { setLang('bn'); setMenu(false); }}>বাংলা</button><button type="button" onClick={() => { setLang('en'); setMenu(false); }}>English</button></div>}
          </div>
        </header>

        <section className="auth-card-wrap">
          <div className="auth-card">
            <div className="auth-card-heading"><span className="auth-eyebrow">YOUR WORKSPACE</span><h1>{register ? t('signup') : t('welcome')}</h1><p>{register ? 'Create your account to get started with Flowbot.' : t('sub')}</p></div>

            <div className="auth-social-grid">
              <button type="button" className="auth-social-button" onClick={() => providerNotReady('Google')}><Chrome size={18} /><span>{t('google')}</span></button>
              <button type="button" disabled={busy} className="auth-social-button" onClick={facebookLogin}><Facebook size={18} /><span>{busy ? 'Please wait…' : t('facebook')}</span></button>
              <button type="button" className="auth-social-button" onClick={() => providerNotReady('Telegram')}><Send size={17} /><span>{t('telegram')}</span></button>
            </div>
            <div className="auth-divider"><span>{t('or')}</span></div>

            <form onSubmit={submit} className="auth-form">
              {register && <label className="auth-field"><span>{t('name')}</span><span className="auth-input-wrap"><UserRound size={17}/><input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" placeholder="Your name" maxLength={120}/></span></label>}
              <label className="auth-field"><span>{t('email')}</span><span className="auth-input-wrap"><Mail size={17}/><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" maxLength={254}/></span></label>
              <label className="auth-field"><span>{t('password')}</span><span className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={register ? 6 : 1} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 6 characters' : 'Enter your password'}/><button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
              {!register && <div className="auth-form-meta"><span><ShieldCheck size={14}/>{t('secure')}</span></div>}
              {error && <p role="alert" className="auth-error">{error}</p>}
              <button disabled={busy} className="auth-submit" type="submit"><span>{busy ? 'Please wait…' : t(register ? 'signup' : 'signin')}</span>{!busy && <ArrowRight size={17}/>}</button>
            </form>
            <p className="auth-toggle">{t(register ? 'toggleIn' : 'toggleUp')} <button type="button" onClick={() => { setRegister(!register); setError(''); setProviderMessage(''); }}>{t(register ? 'signin' : 'signup')}</button></p>
            <p className="auth-privacy">{t('hint')}</p>
            {providerMessage && <p role="status" className="auth-provider-note">{providerMessage}</p>}
            <p className="auth-provider-note">{t('socialNote')}</p>
          </div>
          <p className="auth-bottom-note">{t('noAccount')}</p>
        </section>
        <footer className="auth-footer"><span>© {new Date().getFullYear()} Flowbot</span><span>Automation · Messaging · Growth</span></footer>
      </main>
    </div></Localized>
  );
}
