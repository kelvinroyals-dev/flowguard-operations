// ============================================
// OPERATIONS STATE MANAGER
// Centralized state management for Operations Center
// ============================================

const OpsStateManager = (function() {
    const API_BASE = 'https://api.flowguard.ng/api/v1';
    
    let state = {
        users: [], roles: [], clients: [], properties: [],
        teams: [], equipment: [], alerts: [], sensors: [],
        kpis: null, forecast: null,
        demoMode: localStorage.getItem('ops_demo_mode') === 'true'
    };
    
    // Demo data (only used when demo mode is ON)
    const DEMO_USERS = [
        { userId:'USR-001',email:'admin@flowguard.ng',fullName:'John Adebayo',role:'super_admin',status:'active',lastLogin:'2026-02-23T10:30:00Z' },
        { userId:'USR-002',email:'ops@flowguard.ng',fullName:'Sarah Okafor',role:'operations_manager',status:'active',lastLogin:'2026-02-23T09:15:00Z' },
        { userId:'USR-003',email:'dispatch@flowguard.ng',fullName:'Michael Eze',role:'dispatcher',status:'active',lastLogin:'2026-02-23T11:00:00Z' }
    ];
    
    const DEMO_ROLES = [
        { roleId:'super_admin',name:'Super Admin',permissions:['all'] },
        { roleId:'operations_manager',name:'Operations Manager',permissions:['clients.manage','teams.manage','alerts.manage'] },
        { roleId:'dispatcher',name:'Dispatcher',permissions:['alerts.view','alerts.assign','teams.dispatch'] },
        { roleId:'field_lead',name:'Field Team Lead',permissions:['alerts.view_own','jobs.update'] },
        { roleId:'analyst',name:'Analyst',permissions:['reports.view','reports.export'] },
        { roleId:'finance',name:'Finance',permissions:['billing.view','billing.manage'] }
    ];
    
    const DEMO_CLIENTS = [
        { clientId:'CLI-001',name:'Lekki Gardens',location:'Lekki Phase 1, Lagos',coverage:'2.4 km',healthScore:85,mrr:450000,uptime:99.2,status:'active' },
        { clientId:'CLI-002',name:'Eko Atlantic City',location:'Victoria Island, Lagos',coverage:'5.1 km',healthScore:95,mrr:850000,uptime:99.8,status:'active' },
        { clientId:'CLI-003',name:'Banana Island Estate',location:'Ikoyi, Lagos',coverage:'1.8 km',healthScore:65,mrr:380000,uptime:97.5,status:'active' }
    ];
    
    const DEMO_KPIS = {
        activeClients:18,totalClients:20,mrr:8500000,totalCoverage:47.3,
        activeAlerts:23,criticalAlerts:3,networkUptime:98.7,
        sensorsOnline:{online:142,offline:6,total:148},avgResponseTime:78,
        newClientsThisMonth:3,mrrGrowth:12.5,alertTrend:-14
    };
    
    // API helper
    async function apiCall(endpoint, options = {}) {
        const token = Auth.getToken();
        const config = {
            ...options,
            headers: { 'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...options.headers }
        };
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        return await response.json();
    }
    
    // User Management
    async function loadUsers() {
        if (state.demoMode) { state.users = DEMO_USERS; return DEMO_USERS; }
        try { const data = await apiCall('/users'); state.users = data.data || []; return state.users; }
        catch (e) { console.error('Error loading users:', e); state.users = []; return []; }
    }
    
    async function loadRoles() {
        if (state.demoMode) { state.roles = DEMO_ROLES; return DEMO_ROLES; }
        try { const data = await apiCall('/roles'); state.roles = data.data || []; return state.roles; }
        catch (e) { console.error('Error loading roles:', e); state.roles = []; return []; }
    }
    
    async function inviteUser(email, roleId) {
        if (state.demoMode) return { success: true, message: 'Invite sent (demo)' };
        return await apiCall('/users/invite', { method:'POST', body:JSON.stringify({email,roleId}) });
    }
    
    async function updateUser(userId, data) {
        if (state.demoMode) { const i = state.users.findIndex(u => u.userId === userId); if (i !== -1) state.users[i] = {...state.users[i],...data}; return { success:true }; }
        return await apiCall(`/users/${userId}`, { method:'PUT', body:JSON.stringify(data) });
    }
    
    async function deleteUser(userId) {
        if (state.demoMode) { state.users = state.users.filter(u => u.userId !== userId); return { success:true }; }
        return await apiCall(`/users/${userId}`, { method:'DELETE' });
    }
    
    // Client Management
    async function loadClients() {
        if (state.demoMode) { state.clients = DEMO_CLIENTS; return DEMO_CLIENTS; }
        try { const data = await apiCall('/clients'); state.clients = data.data || []; return state.clients; }
        catch (e) { console.error('Error loading clients:', e); state.clients = []; return []; }
    }
    
    async function createClient(clientData) {
        if (state.demoMode) { const c = { clientId:`CLI-${Date.now()}`,...clientData,status:'active' }; state.clients.push(c); return { success:true, data:c }; }
        return await apiCall('/clients', { method:'POST', body:JSON.stringify(clientData) });
    }
    
    async function updateClient(clientId, data) {
        if (state.demoMode) { const i = state.clients.findIndex(c => c.clientId === clientId); if (i !== -1) state.clients[i] = {...state.clients[i],...data}; return { success:true }; }
        return await apiCall(`/clients/${clientId}`, { method:'PUT', body:JSON.stringify(data) });
    }
    
    // KPIs
    async function loadKPIs() {
        if (state.demoMode) { state.kpis = DEMO_KPIS; return DEMO_KPIS; }
        try { const data = await apiCall('/analytics/kpis'); state.kpis = data.data; return state.kpis; }
        catch (e) { console.error('Error loading KPIs:', e); state.kpis = null; return null; }
    }
    
    // Utility
    function toggleDemoMode() { state.demoMode = !state.demoMode; localStorage.setItem('ops_demo_mode', state.demoMode); return state.demoMode; }
    function getDemoMode() { return state.demoMode; }
    function getUsers() { return state.users; }
    function getRoles() { return state.roles; }
    function getClients() { return state.clients; }
    function getKPIs() { return state.kpis; }
    
    function getState() {
        const kpis = state.kpis || {};
        return {
            sensors: { active: kpis.sensorsOnline?.online || 0, total: kpis.sensorsOnline?.total || 0 },
            alerts: kpis.activeAlerts || 0,
            sla: kpis.networkUptime || 0
        };
    }
    
    return {
        loadUsers, loadRoles, inviteUser, updateUser, deleteUser, getUsers, getRoles,
        loadClients, createClient, updateClient, getClients,
        loadKPIs, getKPIs, getState,
        toggleDemoMode, getDemoMode
    };
})();