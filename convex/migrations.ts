import { mutation } from "./_generated/server"; 
 
 export const migrateLegacyDailyRoutes = mutation({ 
   handler: async (ctx) => { 
     const routes = await ctx.db.query("dailyRoutes").collect(); 
     let count = 0; 
 
     for (const route of routes) { 
       if (!route.loads) { 
         // Backfill structure from legacy fields 
         await ctx.db.patch(route._id, { 
           loads: [ 
             { 
               client: route.client || "Unknown Client", // Fallback 
               quantity: "1", 
               quantityType: "full", // Default since we don't know 
               rateType: "full", // Assume full load rate logic for legacy 
               rate: String(route.rate || "0"), 
 
               // Use existing array if present, else singular fallback, else empty 
               fromLocations: route.fromLocations ?? (route.fromLocation ? [route.fromLocation] : []), 
               toLocations: route.toLocations ?? [], 
             }, 
           ], 
         }); 
         count++; 
       } 
     } 
     return `Migrated ${count} legacy routes.`; 
   }, 
 }); 
 
 /** 
  * Backfill the multi-device `sessions` table from the legacy single-session
  * fields on `users` (users.sessionToken / sessionExpiresAt). Run once after
  * deploying the multi-session auth change so existing logins survive. 
  */ 
 export const migrateLegacySessionsToTable = mutation({ 
   handler: async (ctx) => { 
     const users = await ctx.db.query("users").collect(); 
     const existingTokens = new Set((await ctx.db.query("sessions").collect()).map((s) => s.token)); 
     let count = 0; 
     const now = Date.now(); 
     for (const user of users) { 
       const legacyToken = (user as any).sessionToken; 
       const legacyExpiry = (user as any).sessionExpiresAt; 
       if (legacyToken && legacyExpiry && legacyExpiry > now && !existingTokens.has(legacyToken)) { 
         await ctx.db.insert("sessions", { 
           userId: user._id, 
           token: legacyToken, 
           expiresAt: legacyExpiry, 
           createdAt: now, 
         }); 
         existingTokens.add(legacyToken); 
         count++; 
       } 
     } 
     return `Migrated ${count} legacy sessions to the sessions table.`; 
   }, 
 });