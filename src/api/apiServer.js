// src/api/apiServer.js
import express from 'express';
import cors from 'cors';
import leaderboardCacheService from '../services/leaderboardCacheService.js';
import nominationsCacheService from '../services/nominationsCacheService.js';
import { config } from '../config/config.js';

class ApiServer {
    constructor() {
        this.app = express();
        this.port = process.env.API_PORT || 3000;
        this.apiKey = process.env.API_KEY || 'dev-key';
        
        // Configure Express
        this.app.use(cors());
        this.app.use(express.json());
        
        // Set up rate limiting
        this.setupRateLimiting();
        
        // Set up routes
        this.setupRoutes();
    }
    
    /**
     * Set up rate limiting middleware
     */
    setupRateLimiting() {
        // Simple in-memory rate limiting
        const rateLimits = new Map();
        
        this.app.use((req, res, next) => {
            const ip = req.ip;
            const now = Date.now();
            
            // Clean up old entries (older than 1 minute)
            if (rateLimits.has(ip)) {
                rateLimits.set(
                    ip,
                    rateLimits.get(ip).filter(time => now - time < 60000)
                );
            }
            
            // Initialize if needed
            if (!rateLimits.has(ip)) {
                rateLimits.set(ip, []);
            }
            
            // Check rate limit (60 requests per minute)
            const requests = rateLimits.get(ip);
            if (requests.length >= 60) {
                return res.status(429).json({
                    error: 'Too many requests, please try again later'
                });
            }
            
            // Add current request timestamp
            requests.push(now);
            rateLimits.set(ip, requests);
            
            next();
        });
    }
    
    /**
     * Set up API routes
     */
    setupRoutes() {
        // Middleware to check API key
        const apiKeyAuth = (req, res, next) => {
            const providedKey = req.headers['x-api-key'];
            
            if (!providedKey || providedKey !== this.apiKey) {
                return res.status(401).json({
                    error: 'Unauthorized - Invalid API key'
                });
            }
            
            next();
        };
        
        // Health check endpoint (no auth required)
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString()
            });
        });
        
        // Monthly leaderboard
        this.app.get('/api/leaderboard/monthly', apiKeyAuth, (req, res) => {
            const data = leaderboardCacheService.getMonthlyLeaderboard();
            if (!data) {
                return res.status(404).json({
                    error: 'Monthly leaderboard data not available'
                });
            }
            
            res.json(data);
        });
        
        // Yearly leaderboard
        this.app.get('/api/leaderboard/yearly', apiKeyAuth, (req, res) => {
            const data = leaderboardCacheService.getYearlyLeaderboard();
            if (!data) {
                return res.status(404).json({
                    error: 'Yearly leaderboard data not available'
                });
            }
            
            res.json(data);
        });
        
        // Nominations
        this.app.get('/api/nominations', apiKeyAuth, (req, res) => {
            const data = nominationsCacheService.getNominations();
            if (!data) {
                return res.status(404).json({
                    error: 'Nominations data not available'
                });
            }
            
            res.json(data);
        });
        
        // Force update (admin only)
        this.app.post('/api/admin/force-update', apiKeyAuth, async (req, res) => {
            // Check for admin API key
            const adminKey = process.env.ADMIN_API_KEY || 'admin-key';
            if (req.headers['x-api-key'] !== adminKey) {
                return res.status(403).json({
                    error: 'Forbidden - Admin API key required'
                });
            }
            
            try {
                // Determine what to update
                const { target } = req.body;
                
                if (!target || (target !== 'all' && target !== 'leaderboards' && target !== 'nominations')) {
                    return res.status(400).json({
                        error: 'Invalid target. Must be "all", "leaderboards", or "nominations"'
                    });
                }
                
                const result = {};
                
                if (target === 'all' || target === 'leaderboards') {
                    result.leaderboards = await leaderboardCacheService.forceUpdate();
                }
                
                if (target === 'all' || target === 'nominations') {
                    result.nominations = await nominationsCacheService.forceUpdate();
                }
                
                res.json({
                    status: 'success',
                    message: `Forced update of ${target}`,
                    result
                });
            } catch (error) {
                console.error('Error in force update:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    message: error.message
                });
            }
        });
        
        // Fallback for 404
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Endpoint not found'
            });
        });
    }
    
    /**
     * Start the API server
     */
    start() {
        this.server = this.app.listen(this.port, () => {
            console.log(`API server listening on port ${this.port}`);
        });
    }
    
    /**
     * Stop the API server
     */
    stop() {
        if (this.server) {
            this.server.close();
            console.log('API server stopped');
        }
    }
}

// Create singleton instance
const apiServer = new ApiServer();
export default apiServer;
