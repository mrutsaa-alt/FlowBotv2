import React from 'react';

export default function Sidebar({ googleUser, menuItems, activeMenu, setActiveMenu, isSidebarOpen, setIsSidebarOpen, handleLogout }) {
  return (
    <aside className={`fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out flex flex-col justify-between`}>
      <div>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-yellow-500 text-2xl font-bold">⚡</span>
            <span className="text-xl font-bold text-slate-900">FlowBot</span>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">FREE</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400">✕</button>
        </div>

        <div className="p-3 mx-3 my-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm">
              {googleUser ? googleUser.name.charAt(0) : 'M'}
            </div>
            <span className="text-sm font-semibold text-slate-700 truncate max-w-[110px]">
              {googleUser ? googleUser.name : 'Moslina (Demo)'}
            </span>
          </div>
          <span className="text-slate-400 text-xs">▼</span>
        </div>

        <nav className="p-3 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.name}
              onClick={() => { setActiveMenu(item.name); setIsSidebarOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeMenu === item.name ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </div>
              {item.badge && Number(item.badge) > 0 && (
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-100">
        <button onClick={handleLogout} className="w-full text-xs text-red-600 hover:bg-red-50 py-2.5 rounded-lg font-semibold transition border border-red-100">
          🚪 লগ আউট করুন (Sign Out)
        </button>
      </div>
    </aside>
  );
}
