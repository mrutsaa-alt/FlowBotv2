import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PageSelector from './components/PageSelector.jsx'
import TelegramStudio from './components/TelegramStudio.jsx'
import { Localized } from './i18n.js'
import './index.css'
import './responsive.css'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Localized>
      <App />
      <PageSelector />
      <TelegramStudio />
    </Localized>
  </React.StrictMode>,
)
