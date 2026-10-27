import React, { useEffect, useState } from 'react';
import MainSettings from './settings/MainSettings';
import BillingSettings from './settings/BillingSettings';
import InboxSettings from './settings/InboxSettings';
import ChannelsSettings from './settings/ChannelsSettings';
import { Localized, translate, useLang } from '../i18n';

export default function SettingsView({ initialChannel = '' }) {
  const { lang } = useLang({ bn: {}, en: {} });
  const [activeTab, setActiveTab] = useState(initialChannel === 'facebook' ? 'Messenger' : initialChannel === 'instagram' ? 'Instagram' : initialChannel === 'whatsapp' ? 'WhatsApp' : 'General');
  useEffect(() => { if (initialChannel) setActiveTab(initialChannel === 'facebook' ? 'Messenger' : initialChannel === 'instagram' ? 'Instagram' : initialChannel === 'whatsapp' ? 'WhatsApp' : 'General'); }, [initialChannel]);

  const settingsCategories = [
    {
      title: 'Main',
      items: ['General', 'Notifications', 'Team Members', 'Logs', 'Display']
    },
    {
      title: 'Billing',
      items: ['Subscriptions']
    },
    {
      title: 'Inbox',
      items: ['Inbox Behavior', 'Auto-Assignment']
    },
    {
      title: 'Channels',
      items: ['Instagram', 'TikTok', 'WhatsApp', 'Messenger', 'SMS', 'Email']
    }
  ];

  return (
    <Localized><div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-4 min-h-[500px]">
      
      {/* Sidebar List */}
      <div className="border-r border-slate-100 p-4 space-y-6 bg-slate-50/50">
        <h3 className="font-bold text-slate-800 text-base px-2">Settings</h3>
        
        {settingsCategories.map((cat, idx) => (
          <div key={idx} className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">{cat.title}</p>
            <div className="space-y-0.5 pt-1">
                {cat.items.map((item) => (
                <button
                  key={item}
                  onClick={() => setActiveTab(item)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition ${
                    activeTab === item 
                      ? 'bg-blue-50 text-blue-600 shadow-sm' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                    {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic Sub-Component Container */}
          <div className="col-span-3 p-6 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-800">{translate(activeTab,lang)} {lang==='bn'?'সেটিংস':'Settings'}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{lang==='bn'?`${translate(activeTab,lang)} সংক্রান্ত কনফিগারেশন পরিচালনা করুন`:`Manage ${translate(activeTab,lang).toLowerCase()} configuration`}</p>
        </div>

        {['General', 'Notifications', 'Team Members', 'Logs', 'Display'].includes(activeTab) && (
          <MainSettings tab={activeTab} />
        )}

        {activeTab === 'Subscriptions' && (
          <BillingSettings />
        )}

        {['Inbox Behavior', 'Auto-Assignment'].includes(activeTab) && (
          <InboxSettings tab={activeTab} />
        )}

        {['Instagram', 'TikTok', 'WhatsApp', 'Messenger', 'SMS', 'Email'].includes(activeTab) && (
          <ChannelsSettings tab={activeTab} />
        )}
      </div>

    </div></Localized>
  );
}
