import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, Bell, Bot, ChevronDown, HelpCircle, Contact,
  Home, Inbox, Instagram, Megaphone, Menu, MessageCircle, Plug, Search,
  Send, Settings, Sparkles, Workflow, X, Zap, LogOut, Plus, ArrowUpRight, Globe, Moon, Sun
} from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import FlowBuilder from './components/FlowBuilder';
import HomeView from './components/HomeView';
import AutomationView from './components/AutomationView';
import ContactsView from './components/ContactsView';
import BroadcastsView from './components/BroadcastsView';
import InboxView from './components/InboxView';
import SettingsView from './components/SettingsView';
import FacebookConnect from './components/FacebookConnect';
import { Localized, setLang, useLang } from './i18n';

const NAV = [
  { section: 'WORKSPACE', items: [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'inbox', label: 'Live Chat', icon: Inbox },
    { id: 'contacts', label: 'Contacts', icon: Contact },
  ]},
  { section: 'GROWTH TOOLS', items: [
    { id: 'pro-builder', label: 'Flow Builder', icon: Workflow },
    { id: 'broadcasts', label: 'Broadcasts', icon: Megaphone },
  ]},
  { section: 'CHANNELS & ADMIN', items: [
    { id: 'channels', label: 'Channels', icon: Plug },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]},
];
const TITLES = {
  overview: ['Overview', 'আপনার অটোমেশন ও কাস্টমার এনগেজমেন্টের এক নজরের সারাংশ।'],
  inbox: ['Live Chat', 'সব কাস্টমার কথোপকথন এক জায়গায় পরিচালনা করুন।'],
  contacts: ['Contacts', 'আপনার অডিয়েন্স, লিড এবং কাস্টমার ডেটা পরিচালনা করুন।'],
  'pro-builder': ['Flow Builder', 'এক জায়গায় অটোমেশন তৈরি, সম্পাদনা, পরীক্ষা ও প্রকাশ করুন।'],
  broadcasts: ['Broadcasts', 'আপনার অডিয়েন্সের কাছে ক্যাম্পেইন পাঠানোর প্রস্তুতি নিন।'],
  channels: ['Channels', 'আপনার মেসেজিং চ্যানেল কানেক্ট ও পরিচালনা করুন।'],
  settings: ['Settings', 'ওয়ার্কস্পেস ও অ্যাকাউন্ট কনফিগারেশন।'],
};
const initialContacts = [];
const initialMessages = [];
const getSavedTab = () => {
  try {
    const savedTab = localStorage.getItem('flowbot_active_tab');
    return TITLES[savedTab] ? savedTab : 'overview';
  } catch { return 'overview'; }
};
const getSavedBuilderOpen = () => {
  try { return localStorage.getItem('flowbot_builder_open') === 'true'; }
  catch { return false; }
};
const getSavedTheme = () => {
  try { return localStorage.getItem('flowbot_theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
};

export default function App() {
  const { lang } = useLang({ bn: {}, en: {} });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState(getSavedTab);
  const [builderOpen, setBuilderOpen] = useState(getSavedBuilderOpen);
  const [theme, setTheme] = useState(getSavedTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({ name: '', email: '', picture: '' });
  const [contacts] = useState(initialContacts);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState({ status: 'checking', database: 'unknown', ai: 'unknown' });
  const [settingsInitialChannel, setSettingsInitialChannel] = useState('');
  const [conversationTarget, setConversationTarget] = useState(null);
  const [workspaceInfo, setWorkspaceInfo] = useState({ name: 'Workspace', plan: 'Plan status unavailable' });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('flowbot_theme', theme); } catch {}
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem('flowbot_active_tab', activeTab);
      if (activeTab === 'pro-builder' && builderOpen) localStorage.setItem('flowbot_builder_open', 'true');
      else localStorage.removeItem('flowbot_builder_open');
    } catch {}
  }, [activeTab, builderOpen]);
  useEffect(() => {
    const token = localStorage.getItem('flowbot_token');
    if (!token) { setAuthChecked(true); return; }
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { if (!r.ok) throw new Error('Session expired'); return r.json(); })
      .then(d => { setUserProfile({ name: d.user.name, email: d.user.email, picture: '' }); setIsLoggedIn(true); })
      .catch(() => localStorage.removeItem('flowbot_token'))
      .finally(() => setAuthChecked(true));
  }, []);
  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;
    const check = async () => {
      const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      try {
        const response = await fetch(`${base}/api/system/status`, { headers: { Authorization: `Bearer ${localStorage.getItem('flowbot_token') || ''}` } });
        const data = await response.json().catch(() => ({}));
        if (active) setSystemStatus({ status: response.ok ? (data.status || 'operational') : (data.status || 'degraded'), database: data.database || 'unknown', ai: data.ai || 'unknown' });
      } catch { if (active) setSystemStatus({ status: 'unavailable', database: 'unavailable', ai: 'unknown' }); }
    };
    check();
    import('./api').then(({ api }) => api('/api/workspaces')).then(async list => {
      const workspace = Array.isArray(list) ? list[0] : null;
      if (!workspace || !active) return;
      let plan = 'Free plan';
      try { const billing = await (await import('./api')).api(`/api/workspaces/${workspace.id}/billing`); plan = billing.plan_key ? `${billing.plan_key} plan` : plan; }
      catch {}
      if (active) setWorkspaceInfo({ name: workspace.name || 'Workspace', plan });
    }).catch(() => {});
    const timer = window.setInterval(check, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isLoggedIn]);

  const handleLogin = (data) => {
    localStorage.setItem('flowbot_token', data.token);
    setUserProfile({ name: data.user.name, email: data.user.email, picture: '' });
    setIsLoggedIn(true);
  };
  const handleLogout = async () => {
    const token = localStorage.getItem('flowbot_token');
    try { if (token) await fetch(`${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/auth/logout`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } }); } catch {}
    localStorage.removeItem('flowbot_token');
    setIsLoggedIn(false);
    setActiveTab('overview');
  };

  const [pageTitle, pageSubtitle] = TITLES[activeTab] || TITLES.overview;
  const pageContent = useMemo(() => {
    switch (activeTab) {
      case 'overview': return <HomeView automations={[]} pages={[]} />;
      case 'inbox': return <InboxView messages={initialMessages} initialConversation={conversationTarget} />;
      case 'contacts': return <ContactsView contacts={contacts} onOpenConversation={target => { setConversationTarget(target); setActiveTab('inbox'); }} />;
      case 'pro-builder': return <AutomationView builderOpen={builderOpen} onBuilderOpenChange={setBuilderOpen} />;
      case 'broadcasts': return <BroadcastsView />;
      case 'channels': return <ChannelsWorkspace onConnect={(platform) => { setSettingsInitialChannel(platform); setActiveTab('settings'); }} />;
      case 'settings': return <SettingsView initialChannel={settingsInitialChannel} />;
      default: return <HomeView automations={[]} pages={[]} />;
    }
  }, [activeTab, builderOpen, contacts, conversationTarget]);

  if (!authChecked) return <Localized><div className="min-h-screen flex items-center justify-center text-slate-500">Loading session…</div></Localized>;
  if (!isLoggedIn) return <Localized><LoginScreen onLogin={handleLogin} /></Localized>;

  return (
    <Localized><div className={`app-shell theme-${theme} ${activeTab === 'pro-builder' && builderOpen ? 'builder-mode' : ''}`}>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Zap size={20} fill="currentColor" /></div>
          <div className="brand-copy"><strong>Flowbot</strong><span>ENGAGEMENT PLATFORM</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <button className="workspace-switcher">
          <div className="workspace-avatar">F</div>
          <span><strong data-no-translate>{workspaceInfo.name}</strong><small>{workspaceInfo.plan}</small></span>
          <ChevronDown size={16} className="muted-icon"/>
        </button>
        <nav className="main-nav">
          {NAV.map(group => <div className="nav-group" key={group.section}>
            <p className="nav-heading">{group.section}</p>
            {group.items.map(item => {
              const Icon = item.icon;
              return <button key={item.id} title={item.label} aria-label={item.label} onClick={() => { setActiveTab(item.id); setBuilderOpen(false); setSidebarOpen(false); }}
                className={`nav-item ${activeTab === item.id ? 'nav-item-active' : ''}`}>
                <Icon size={18} strokeWidth={1.9}/><span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
                {activeTab === item.id && <span className="nav-live-dot"/>}
              </button>;
            })}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><HelpCircle size={17}/></div><div><strong>Need a hand?</strong><span>Visit the help center</span></div><ArrowUpRight size={15}/></div>
          <div className="sidebar-user">
            {userProfile.picture ? <img src={userProfile.picture} alt="" /> : <div className="user-avatar">{(userProfile.name || 'U').charAt(0).toUpperCase()}</div>}
            <div className="user-meta"><strong data-no-translate>{userProfile.name}</strong><span data-no-translate>{userProfile.email}</span></div>
            <button className="icon-button" onClick={handleLogout} title="Sign out" aria-label="Sign out"><LogOut size={17}/></button>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
            <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className={`connection-status ${systemStatus.status !== 'operational' ? 'connection-status-degraded' : ''}`} title={`API: ${systemStatus.status}; Database: ${systemStatus.database}; AI: ${systemStatus.ai}`}><span/> {systemStatus.status === 'checking' ? 'Checking systems…' : systemStatus.status === 'operational' ? 'Core systems operational' : systemStatus.status === 'degraded' ? 'System degraded' : 'System unavailable'}</div>
            <div className="header-action-group">
              <div className="auth-language-wrap">
                <button type="button" className="auth-language" aria-label="Choose language" aria-expanded={languageMenuOpen} onClick={() => setLanguageMenuOpen(open=>!open)}><Globe size={17}/><span>{lang === 'bn' ? 'বাংলা' : 'English'}</span></button>
                {languageMenuOpen&&<div className="auth-language-menu" role="menu"><button type="button" role="menuitem" onClick={()=>{setLang('bn');setLanguageMenuOpen(false);}}>বাংলা</button><button type="button" role="menuitem" onClick={()=>{setLang('en');setLanguageMenuOpen(false);}}>English</button></div>}
              </div>
              <button type="button" className="icon-button" title={theme==='dark'?'Switch to light theme':'Switch to dark theme'} aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'} onClick={()=>setTheme(current=>current==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
              <button className="icon-button" aria-label="Search workspace" title="Search workspace" onClick={() => setSearchOpen(true)}><Search size={18}/></button>
              <div className="notification-wrap">
                <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18}/></button>
                {notificationsOpen && <div className="notification-popover"><strong>Notifications</strong><p>Notification feed is not connected yet.</p></div>}
              </div>
            </div>
            <div className="topbar-avatar">{(userProfile.name || 'U').charAt(0).toUpperCase()}</div>
          </div>
        </header>
        <section className="page-area">
          <div className="page-heading">
            <div><div className="eyebrow"><Sparkles size={13}/> WORKSPACE</div><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
            <div className="heading-actions">
              {null}
              
            </div>
          </div>
          <div className={`page-content ${activeTab === 'pro-builder' ? 'page-content-builder' : ''}`}>
            {pageContent}
          </div>
          {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} onNavigate={(tab) => { setActiveTab(tab); setSearchOpen(false); }} />}
      <footer className="app-footer"><span>Flowbot <b>·</b> Customer engagement workspace</span><span><Activity size={13}/> Workspace</span></footer>
        </section>
      </main>
    </div></Localized>
  );
}

function FlowWorkspace() {
  return <FlowBuilder />;
}

function ChannelsWorkspace({ onConnect }) {
  const [channels, setChannels] = useState([]);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [telegramNotice, setTelegramNotice] = useState('');
  const [disconnecting, setDisconnecting] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    import('./api').then(({ loadChannels }) => loadChannels()).then(items => { if (active) setChannels(items); })
      .catch(e => { if (active) setError(e.message || 'Could not load channels'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const disconnectChannel = async channel => {
    const name = channel.page_name || channel.platform;
    if (!window.confirm(`Disconnect ${name}? Its saved contacts, conversations, and automations will also be deleted.`)) return;
    setDisconnecting(String(channel.id));
    setError('');
    setNotice('');
    try {
      const { api } = await import('./api');
      const path = channel.platform === 'telegram'
        ? `/api/telegram/bots/${encodeURIComponent(channel.id)}`
        : `/api/channels/${encodeURIComponent(channel.id)}`;
      await api(path, { method: 'DELETE' });
      setChannels(current => current.filter(item => String(item.id) !== String(channel.id)));
      setNotice(`${name} disconnected.`);
    } catch (e) { setError(e.message || 'Could not disconnect channel'); }
    finally { setDisconnecting(''); }
  };
  const platforms = [
    { name: 'Facebook Messenger', platform: 'facebook', detail: 'Connect Facebook pages and manage Messenger conversations.', icon: MessageCircle, tone: 'channel-facebook' },
    { name: 'Instagram', platform: 'instagram', detail: 'Connect an Instagram Professional account for eligible messaging features.', icon: Instagram, tone: 'channel-instagram' },
    { name: 'Telegram', platform: 'telegram', detail: 'Connect a Telegram bot to manage automated conversations.', icon: Send, tone: 'channel-telegram' },
    { name: 'WhatsApp', platform: 'whatsapp', detail: 'Connect a WhatsApp Business Cloud API phone number.', icon: MessageCircle, tone: 'channel-whatsapp' },
  ];
  return <Localized><div className="module-stack"><div className="module-toolbar"><div><h2>Messaging channels</h2><p>Connect provider accounts and see their actual saved connection status.</p></div><span className="status-pill">{loading ? 'Loading…' : `${channels.length} connected`}</span></div>
    {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl p-3">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">{notice}</p>}
    <div className="channel-grid">{platforms.map(c => {
      const Icon = c.icon;
      const matches = channels.filter(ch => String(ch.platform || '').toLowerCase() === c.platform);
      return <div className="channel-card" key={c.platform}>
        <div className={`channel-icon ${c.tone}`}><Icon size={21}/></div>
        <h3>{c.name}</h3>
        <p>{c.detail}</p>
        <p className="text-xs text-slate-500">{loading ? 'Checking connection…' : `${matches.length} connected`}</p>
        {matches.map(channel => <div key={channel.id} className="flex items-center justify-between gap-3 border-t border-slate-200 py-2">
          <span data-no-translate className="min-w-0 truncate text-xs font-medium text-slate-700">{channel.page_name}</span>
          <button type="button" disabled={disconnecting === String(channel.id)} onClick={() => disconnectChannel(channel)} className="shrink-0 text-xs text-red-700 border border-red-200 rounded-lg px-3 py-2 disabled:opacity-50">
            {disconnecting === String(channel.id) ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>)}
        <button className="secondary-button" onClick={() => c.platform === 'telegram' ? (setTelegramOpen(true), setTelegramError(''), setTelegramNotice('')) : onConnect(c.platform)}>
          <Plug size={14}/>{' '}{c.platform === 'telegram' && matches.length ? 'Reconnect / add bot' : matches.length ? 'Manage connection' : c.platform === 'telegram' ? 'Connect bot' : 'Connect channel'}
        </button>
      </div>;
    })}</div>
    <div className="channel-connect-existing"><h3>Provider setup</h3><p>Open Settings → Channels to complete OAuth or enter provider credentials. Live delivery requires valid permissions and webhook configuration.</p><button className="secondary-button" onClick={() => onConnect('facebook')}>Open channel settings</button></div>
    {telegramOpen && <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Connect Telegram bot" onMouseDown={e => { if (e.target === e.currentTarget) setTelegramOpen(false); }}><form className="search-dialog p-5 space-y-4" onSubmit={async e => { e.preventDefault(); setTelegramBusy(true); setTelegramError(''); setTelegramNotice(''); try { const { api, loadChannels } = await import('./api'); await api('/api/telegram/bots', { method: 'POST', body: JSON.stringify({ token: telegramToken.trim() }) }); setTelegramToken(''); setTelegramNotice('Telegram bot connected or credentials refreshed.'); setChannels(await loadChannels()); setTelegramOpen(false); } catch (err) { setTelegramError(err.message || 'Telegram connection failed'); } finally { setTelegramBusy(false); } }}><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Connect Telegram bot</h3><button type="button" className="icon-button" onClick={() => setTelegramOpen(false)} aria-label="Close"> <X size={18}/></button></div><p className="text-sm text-slate-500">Create a bot with Telegram BotFather and paste its token. If this bot is already listed but not responding, submit the same token again to refresh its saved credentials without deleting chats or flows.</p><label className="block text-xs font-medium text-slate-600">Bot token<input type="password" autoComplete="off" required maxLength={255} value={telegramToken} onChange={e => setTelegramToken(e.target.value)} className="mt-1 w-full border rounded-xl p-3 font-mono" placeholder="123456789:AA…"/></label>{telegramError && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{telegramError}</p>}{telegramNotice && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg">{telegramNotice}</p>}<div className="flex justify-end gap-2"><button type="button" className="secondary-button" onClick={() => setTelegramOpen(false)}>Cancel</button><button disabled={telegramBusy || !telegramToken.trim()} className="primary-button">{telegramBusy ? 'Validating…' : 'Connect bot'}</button></div></form></div>}
  </div></Localized>;
}

function GlobalSearch({ onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ channels: [], contacts: [], flows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (query.trim().length < 2) { setResults({ channels: [], contacts: [], flows: [] }); setError(''); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const { api } = await import('./api');
        const data = await api(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (active) setResults(data);
      } catch (e) { if (active) setError(e.message || 'Search failed'); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  const all = [...(results.channels || []), ...(results.contacts || []), ...(results.flows || [])];
  return <Localized><div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search workspace" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="search-dialog"><div className="search-dialog-input"><Search size={18}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts, channels, automations…"/><button className="icon-button" onClick={onClose} aria-label="Close search"><X size={18}/></button></div>
      {error && <p role="alert" className="p-3 text-sm text-red-700">{error}</p>}{loading && <p className="p-4 text-sm text-slate-500">Searching…</p>}
      {!loading && query.trim().length >= 2 && !error && all.length === 0 && <p className="p-4 text-sm text-slate-500">No matching contacts, channels, or automations.</p>}
      {all.length > 0 && <div className="search-results">{results.channels.map(item => <button key={`c-${item.id}`} onClick={() => onNavigate('channels')}><Plug size={16}/><span><strong data-no-translate>{item.title}</strong><small>Channel · <span data-no-translate>{item.detail}</span></small></span></button>)}{results.contacts.map(item => <button key={`s-${item.id}`} onClick={() => onNavigate('contacts')}><Contact size={16}/><span><strong data-no-translate>{item.title || item.detail}</strong><small>Contact · <span data-no-translate>{item.detail}</span></small></span></button>)}{results.flows.map(item => <button key={`f-${item.id}`} onClick={() => onNavigate('pro-builder')}><Workflow size={16}/><span><strong data-no-translate>{item.title}</strong><small>Automation · <span data-no-translate>{item.detail}</span></small></span></button>)}</div>}
      {query.trim().length < 2 && <p className="p-4 text-xs text-slate-500">Type at least 2 characters to search the current workspace.</p>}
    </div>
  </div></Localized>;
}
