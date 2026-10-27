import React from 'react';
import { Localized, translate, useLang } from '../../i18n';

export default function InboxSettings({ tab }) {
  const {lang}=useLang({bn:{},en:{}});
  return (
    <Localized><div className="space-y-4 max-w-xl">
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <h4 className="font-bold text-xs text-slate-800">{translate(tab,lang)} {lang==='bn'?'কনফিগারেশন':'configuration'}</h4>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600">Auto Assign New Live Chats</span>
          <input type="checkbox" defaultChecked className="rounded text-blue-600" />
        </div>
      </div>
    </div></Localized>
  );
}
