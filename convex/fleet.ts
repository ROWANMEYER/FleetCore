import { query } from "./_generated/server"; 
 import { v } from "convex/values"; 
 
 export const listTrucks = query({ 
     args: {}, 
     handler: async (ctx) => { 
         const trucks = await ctx.db.query("trucks").collect(); 
         return trucks.map((t) => ({ 
             label: `${t.truckFleetNo} (${t.registration})`, 
             value: t.truckFleetNo, 
         })); 
     }, 
 }); 
 
 export const listTrailers = query({ 
     args: {}, 
     handler: async (ctx) => { 
         const trailers = await ctx.db.query("trailers").collect(); 
         return trailers.map((t) => { 
             // Use string field if available, else number 
             const fleetNo = t.trailerFleetNoStr || String(t.trailerFleetNo); 
             return { 
                 label: `${fleetNo} (${t.type})`, 
                 value: fleetNo, 
             }; 
         }); 
     }, 
 }); 
 
 export const listDrivers = query({ 
     args: {}, 
     handler: async (ctx) => { 
         const drivers = await ctx.db.query("drivers").collect(); 
         return drivers.map((d) => ({ 
             label: d.driverName, 
             value: d.driverName, // Storing name as requested by prompt 
         })); 
     }, 
 });

export const getTrucks = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("trucks").collect();
    },
});

export const getTrailers = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("trailers").collect();
    },
});

export const getDrivers = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("drivers").collect();
    },
});