import { mutation } from "./_generated/server"; 
 import { v } from "convex/values"; 
 
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