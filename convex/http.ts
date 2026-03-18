import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
// import { 
//   createHttp,
//   getRoutesByDateHttp,
//   getTrucksHttp,
//   getTrailersHttp,
//   getDriversHttp
// } from "./dailyRoutes";

const http = httpRouter();

// http.route({
//   path: "/dailyRoutes/create",
//   method: "POST",
//   handler: createHttp,
// });

// http.route({
//   path: "/dailyRoutes/getRoutesByDate",
//   method: "POST",
//   handler: getRoutesByDateHttp,
// });

// http.route({
//   path: "/dailyRoutes/getTrucks",
//   method: "POST",
//   handler: getTrucksHttp,
// });

// http.route({
//   path: "/dailyRoutes/getTrailers",
//   method: "POST",
//   handler: getTrailersHttp,
// });

// http.route({
//   path: "/dailyRoutes/getDrivers",
//   method: "POST",
//   handler: getDriversHttp,
// });

http.route({
  path: "/ping",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("pong", { status: 200 });
  }),
});

export default http;