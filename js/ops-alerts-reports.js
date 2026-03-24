// ============================================
// ALERTS & REPORTS MODULES (NEON THEME)
// Alert management and analytics reporting
// ============================================

const OpsAlerts = (function() {
    
    async function render(container) {
        container.innerHTML = `
            <div style="margin-bottom: 24px;">
                <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--text-bright); margin-bottom: 4px;">Live Alerts</h2>
                <p style="font-size: 11px; color: var(--text-dim); letter-spacing: 0.5px;">Monitor and respond to system alerts</p>
            </div>
            
            <!-- Alert Stats -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                <div class="ops-card">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="font-size: 10px; color: var(--text-dim); letter-spacing: 1px; margin-bottom: 6px;">CRITICAL</div>
                        <div style="font-size: 28px; font-weight: 700; font-family: var(--font-mono); color: var(--s-critical);" id="alert-critical">—</div>
                    </div>
                </div>
                <div class="ops-card">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="font-size: 10px; color: var(--text-dim); letter-spacing: 1px; margin-bottom: 6px;">WARNING</div>
                        <div style="font-size: 28px; font-weight: 700; font-family: var(--font-mono); color: var(--s-warning);" id="alert-warning">—</div>
                    </div>
                </div>
                <div class="ops-card">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="font-size: 10px; color: var(--text-dim); letter-spacing: 1px; margin-bottom: 6px;">WATCH</div>
                        <div style="font-size: 28px; font-weight: 700; font-family: var(--font-mono); color: var(--s-watch);" id="alert-watch">—</div>
                    </div>
                </div>
                <div class="ops-card">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="font-size: 10px; color: var(--text-dim); letter-spacing: 1px; margin-bottom: 6px;">TOTAL</div>
                        <div style="font-size: 28px; font-weight: 700; font-family: var(--font-mono); color: var(--text-bright);" id="alert-total">—</div>
                    </div>
                </div>
            </div>
            
            <!-- Alerts Feed -->
            <div class="ops-card">
                <div class="ops-card-header">
                    <div class="ops-card-title">Active Alerts</div>
                </div>
                <div class="ops-card-body">
                    <div id="alerts-feed" style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="text-align: center; padding: 20px; color: var(--text-dim);">
                            <div class="loading" style="margin: 0 auto;"></div>
                            <div style="margin-top: 12px; font-size: 12px;">Loading alerts...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        loadAlerts();
    }
    
    async function loadAlerts() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                renderError('Not authenticated');
                return;
            }
            
            const response = await fetch('https://api.flowguard.ng/api/v1/alerts', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error(`API returned ${response.status}`);
            
            const data = await response.json();
            const alerts = data.data || data.alerts || [];
            
            renderAlertsFeed(Array.isArray(alerts) ? alerts : []);
            updateAlertStats(alerts);
            
        } catch (error) {
            console.error('Load alerts error:', error);
            renderError(error.message);
        }
    }
    
    function updateAlertStats(alerts) {
        const stats = alerts.reduce((acc, alert) => {
            if (alert.severity === 'critical') acc.critical++;
            else if (alert.severity === 'warning' || alert.severity === 'moderate') acc.warning++;
            else acc.watch++;
            return acc;
        }, { critical: 0, warning: 0, watch: 0 });
        
        document.getElementById('alert-critical').textContent = stats.critical;
        document.getElementById('alert-warning').textContent = stats.warning;
        document.getElementById('alert-watch').textContent = stats.watch;
        document.getElementById('alert-total').textContent = alerts.length;
        
        // Update global alert count for sys-bar
        if (typeof updateAlertCount === 'function') {
            updateAlertCount(alerts.length);
        }
    }
    
    function renderAlertsFeed(alerts) {
        const container = document.getElementById('alerts-feed');
        if (!container) return;
        
        if (!alerts || alerts.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-dim);">
                    <svg style="width: 48px; height: 48px; margin: 0 auto 12px; opacity: 0.3;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div style="font-size: 12px;">No active alerts</div>
                    <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">System nominal</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = alerts.map(alert => {
            const severity = alert.severity || 'watch';
            const borderColor = severity === 'critical' ? 'var(--s-critical)' : 
                                severity === 'warning' ? 'var(--s-warning)' : 'var(--s-watch)';
            
            return `
                <div style="padding: 14px; background: var(--surface); border-left: 3px solid ${borderColor}; border-radius: 8px;">
                    <div style="display: flex; align-items: start; justify-content: space-between; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <span class="status-badge ${severity}">${severity}</span>
                                <span style="font-weight: 600; color: var(--text-bright); font-size: 13px;">${alert.alert_type || alert.type || 'System Alert'}</span>
                            </div>
                            <div style="font-size: 12px; color: var(--text-mid); margin-bottom: 4px;">
                                📍 ${alert.location || alert.property || '—'}
                            </div>
                            <div style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono);">
                                ${formatTime(alert.timestamp || alert.created_at)}
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            ${alert.status === 'pending' ? `
                                <button onclick="OpsAlerts.assignAlert('${alert.alert_id || alert.id}')" class="btn-secondary" style="font-size: 11px; padding: 6px 12px;">
                                    Assign
                                </button>
                            ` : ''}
                            <button onclick="OpsAlerts.viewAlert('${alert.alert_id || alert.id}')" class="btn-table-action">
                                <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    ${alert.assigned_team ? `
                        <div style="padding-top: 8px; border-top: 1px solid var(--panel-edge); font-size: 11px; color: var(--text-dim);">
                            Assigned to: <span style="color: var(--text-mid); font-weight: 600;">${alert.assigned_team}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
    
    function formatTime(dateString) {
        if (!dateString) return '—';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        
        if (minutes < 60) return `${minutes} min ago`;
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString();
    }
    
    function renderError(message) {
        const container = document.getElementById('alerts-feed');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="color: var(--s-critical); font-weight: 600; margin-bottom: 8px;">Failed to Load Alerts</div>
                    <div style="color: var(--text-dim); font-size: 11px; margin-bottom: 16px;">${message}</div>
                    <button onclick="OpsAlerts.render(document.getElementById('content-alerts'))" class="btn-secondary">Retry</button>
                </div>
            `;
        }
    }
    
    function assignAlert(id) { showToast('Assign alert ' + id, 'watch'); }
    function viewAlert(id) { showToast('Opening alert ' + id, 'nominal'); }
    
    function showToast(msg, type = 'nominal') {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:80px;right:20px;background:var(--panel);border:1px solid var(--panel-edge);padding:12px 18px;border-radius:8px;display:flex;align-items:center;gap:10px;z-index:9999;opacity:0;transition:opacity 0.3s;';
        toast.innerHTML = `<div class="pulse-dot ${type}"></div><span style="font-size:12px;">${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '1', 10);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }
    
    return { render, assignAlert, viewAlert };
})();

// ============================================
// REPORTS MODULE (NEON THEME)
// ============================================

const OpsReports = (function() {
    
    function render(container) {
        container.innerHTML = `
            <div style="margin-bottom: 24px;">
                <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--text-bright); margin-bottom: 4px;">Reports & Analytics</h2>
                <p style="font-size: 11px; color: var(--text-dim); letter-spacing: 0.5px;">Generate and export operational reports</p>
            </div>
            
            <!-- Report Types -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                <div class="ops-card" style="cursor: pointer; transition: all 0.2s;" onclick="OpsReports.generate('daily')" onmouseover="this.style.borderColor='var(--neon-dim)'" onmouseout="this.style.borderColor='var(--panel-edge)'">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="width: 48px; height: 48px; margin: 0 auto 12px; background: rgba(0,229,204,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <svg style="width: 24px; height: 24px; color: var(--neon);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                        </div>
                        <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 4px;">Daily Operations</div>
                        <div style="font-size: 10px; color: var(--text-dim);">Today's activity summary</div>
                    </div>
                </div>
                
                <div class="ops-card" style="cursor: pointer; transition: all 0.2s;" onclick="OpsReports.generate('weekly')" onmouseover="this.style.borderColor='var(--neon-dim)'" onmouseout="this.style.borderColor='var(--panel-edge)'">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="width: 48px; height: 48px; margin: 0 auto 12px; background: rgba(0,229,204,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <svg style="width: 24px; height: 24px; color: var(--neon);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                        </div>
                        <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 4px;">Weekly Performance</div>
                        <div style="font-size: 10px; color: var(--text-dim);">Team & system metrics</div>
                    </div>
                </div>
                
                <div class="ops-card" style="cursor: pointer; transition: all 0.2s;" onclick="OpsReports.generate('financial')" onmouseover="this.style.borderColor='var(--neon-dim)'" onmouseout="this.style.borderColor='var(--panel-edge)'">
                    <div class="ops-card-body" style="text-align: center;">
                        <div style="width: 48px; height: 48px; margin: 0 auto 12px; background: rgba(0,229,204,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <svg style="width: 24px; height: 24px; color: var(--neon);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 4px;">Financial Report</div>
                        <div style="font-size: 10px; color: var(--text-dim);">Revenue & billing</div>
                    </div>
                </div>
            </div>
            
            <!-- Recent Reports -->
            <div class="ops-card">
                <div class="ops-card-header">
                    <div class="ops-card-title">Recent Reports</div>
                </div>
                <div class="ops-card-body">
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface); border-radius: 8px;">
                            <div>
                                <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 3px;">Daily Operations — Feb 23, 2026</div>
                                <div style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono);">Generated today at 11:59 PM</div>
                            </div>
                            <button class="btn-secondary" style="font-size: 11px;">Download</button>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface); border-radius: 8px;">
                            <div>
                                <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 3px;">Weekly Performance — Week 8</div>
                                <div style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono);">Generated 2 days ago</div>
                            </div>
                            <button class="btn-secondary" style="font-size: 11px;">Download</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    function generate(type) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:80px;right:20px;background:var(--panel);border:1px solid var(--panel-edge);padding:12px 18px;border-radius:8px;display:flex;align-items:center;gap:10px;z-index:9999;opacity:0;transition:opacity 0.3s;';
        toast.innerHTML = `<div class="pulse-dot watch"></div><span style="font-size:12px;">Generating ${type} report...</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '1', 10);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }
    
    return { render, generate };
})();