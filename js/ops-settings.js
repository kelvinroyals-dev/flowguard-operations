// ============================================
// SETTINGS MODULE (NEON THEME)
// System configuration and preferences
// ============================================

const OpsSettings = (function() {
    
    function render(container) {
        container.innerHTML = `
            <div style="margin-bottom: 24px;">
                <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--text-bright); margin-bottom: 4px;">System Settings</h2>
                <p style="font-size: 11px; color: var(--text-dim); letter-spacing: 0.5px;">Configure system preferences and thresholds</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Left Column -->
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <!-- Development Settings -->
                    <div class="ops-card">
                        <div class="ops-card-header">
                            <div class="ops-card-title">Development</div>
                        </div>
                        <div class="ops-card-body">
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface); border-radius: 8px;">
                                <div>
                                    <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 3px;">Demo Mode</div>
                                    <div style="font-size: 10px; color: var(--text-dim);">Use demo data instead of API</div>
                                </div>
                                <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                                    <input type="checkbox" id="demo-toggle" ${OpsStateManager && OpsStateManager.getDemoMode() ? 'checked' : ''} onchange="OpsSettings.toggleDemo()" style="opacity: 0; width: 0; height: 0;">
                                    <span style="position: absolute; inset: 0; background: var(--surface); border: 1px solid var(--panel-edge); border-radius: 24px; transition: 0.3s;"></span>
                                    <span style="position: absolute; height: 16px; width: 16px; left: 4px; bottom: 4px; background: var(--text-dim); border-radius: 50%; transition: 0.3s;"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Alert Thresholds -->
                    <div class="ops-card">
                        <div class="ops-card-header">
                            <div class="ops-card-title">Alert Thresholds</div>
                        </div>
                        <div class="ops-card-body">
                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <div>
                                    <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.5px;">CRITICAL WATER LEVEL (%)</label>
                                    <input type="number" value="90" min="0" max="100" class="input-field">
                                </div>
                                <div>
                                    <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.5px;">WARNING WATER LEVEL (%)</label>
                                    <input type="number" value="70" min="0" max="100" class="input-field">
                                </div>
                                <div>
                                    <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.5px;">AUTO-ESCALATION TIME (min)</label>
                                    <input type="number" value="30" min="0" class="input-field">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Right Column -->
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <!-- Notification Settings -->
                    <div class="ops-card">
                        <div class="ops-card-header">
                            <div class="ops-card-title">Notifications</div>
                        </div>
                        <div class="ops-card-body">
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface); border-radius: 8px;">
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 3px;">Email Alerts</div>
                                        <div style="font-size: 10px; color: var(--text-dim);">Send alerts via email</div>
                                    </div>
                                    <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                                        <input type="checkbox" checked style="opacity: 0; width: 0; height: 0;">
                                        <span style="position: absolute; inset: 0; background: var(--s-nominal); border-radius: 24px; transition: 0.3s;"></span>
                                        <span style="position: absolute; height: 16px; width: 16px; right: 4px; bottom: 4px; background: white; border-radius: 50%; transition: 0.3s;"></span>
                                    </label>
                                </div>
                                
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface); border-radius: 8px;">
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-bright); margin-bottom: 3px;">SMS Alerts</div>
                                        <div style="font-size: 10px; color: var(--text-dim);">Critical alerts via SMS</div>
                                    </div>
                                    <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                                        <input type="checkbox" checked style="opacity: 0; width: 0; height: 0;">
                                        <span style="position: absolute; inset: 0; background: var(--s-nominal); border-radius: 24px; transition: 0.3s;"></span>
                                        <span style="position: absolute; height: 16px; width: 16px; right: 4px; bottom: 4px; background: white; border-radius: 50%; transition: 0.3s;"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Company Info -->
                    <div class="ops-card">
                        <div class="ops-card-header">
                            <div class="ops-card-title">Company Information</div>
                        </div>
                        <div class="ops-card-body">
                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <div>
                                    <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.5px;">COMPANY NAME</label>
                                    <input type="text" value="FlowGuard Nigeria" class="input-field">
                                </div>
                                <div>
                                    <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.5px;">CONTACT EMAIL</label>
                                    <input type="email" value="ops@flowguard.ng" class="input-field">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Save Button -->
            <div style="margin-top: 24px; text-align: right;">
                <button onclick="OpsSettings.save()" class="btn-primary">
                    <svg style="width: 14px; height: 14px; display: inline; margin-right: 6px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    Save Settings
                </button>
            </div>
            
            <style>
                #demo-toggle:checked + span { background: var(--s-nominal); }
                #demo-toggle:checked + span + span { transform: translateX(20px); background: white; }
            </style>
        `;
    }
    
    function toggleDemo() {
        if (typeof OpsStateManager !== 'undefined') {
            const newMode = OpsStateManager.toggleDemoMode();
            showToast(`Demo mode ${newMode ? 'enabled' : 'disabled'}. Reloading...`, 'watch');
            setTimeout(() => location.reload(), 1500);
        }
    }
    
    function save() {
        showToast('Settings saved successfully', 'nominal');
    }
    
    function showToast(msg, type = 'nominal') {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:80px;right:20px;background:var(--panel);border:1px solid var(--panel-edge);padding:12px 18px;border-radius:8px;display:flex;align-items:center;gap:10px;z-index:9999;opacity:0;transition:opacity 0.3s;';
        toast.innerHTML = `<div class="pulse-dot ${type}"></div><span style="font-size:12px;">${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '1', 10);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }
    
    return { render, toggleDemo, save };
})();
