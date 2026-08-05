import re

p = "convex/dailyRoutes.ts"
s = open(p, encoding="utf-8").read()

REGION_ARG = (
    'region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),\n'
)
REGION_INLINE = (
    'region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape")))'
)

# Queries needing the region arg (handler already calls resolveEffectiveRegion with args.region)
QUERIES = [
    "getRoutesByDate",
    "getForSheets",
    "getById",
    "getRoutesByTruckAndDate",
    "listRecentRoutes",
    "getLoadsForEmailReport",
    "getQuickSendReport",
    "getRecentRoutesByTruck",
]

count = 0
for name in QUERIES:
    # Find: export const NAME = query({ ... args block ... })
    pattern = re.compile(
        r"(export const " + re.escape(name) + r" = query\(\{\s*args:\s*\{)(.*?)(\s*\})",
        re.DOTALL,
    )
    m = pattern.search(s)
    assert m, f"could not find {name}"
    args_block = m.group(2)
    if "region: v.optional(v.union(v.literal(" in args_block:
        continue  # already has region
    # Insert region arg right after the token line inside args
    token_re = re.compile(r"(token: v\.optional\(v\.union\(v\.string\(\), v\.null\(\)\))(\)?)")
    tm = token_re.search(args_block)
    assert tm, f"{name}: token arg not found"
    if tm.group(2) == ")":
        # inline single-line args: add region inline
        insertion = ", " + REGION_INLINE
    else:
        insertion = ",\n    " + REGION_ARG.rstrip("\n")
    new_args = args_block[: tm.end()] + insertion + args_block[tm.end() :]
    s = pattern.sub(lambda mm: mm.group(1) + new_args + mm.group(3), s, count=1)
    count += 1

open(p, "w", encoding="utf-8").write(s)
print("patched:", count)
