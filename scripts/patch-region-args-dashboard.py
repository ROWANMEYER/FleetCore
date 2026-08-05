import re

REGION_ARG = (
    'region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),\n'
)

for p in ["convex/dashboard.ts", "convex/subcontractors.ts"]:
    s = open(p, encoding="utf-8").read()
    # Insert region arg after every token line that is inside an args block,
    # i.e. the pattern "token: ...,\n    }," followed by handler using resolveEffectiveRegion.
    # Simplest robust approach: find all handlers calling resolveEffectiveRegion, then for the
    # preceding args block (ending with token line), add region after it.
    count = 0
    # Match: token line at end of args (followed by },) then handler that uses args.region
    pattern = re.compile(
        r"(token: v\.optional\(v\.union\(v\.string\(\), v\.null\(\)\)\),)(\n(\s+)\})"
    )
    # Count how many resolveEffectiveRegion calls exist
    n_calls = s.count("resolveEffectiveRegion(ctx, args.token, args.region)")
    for m in pattern.finditer(s):
        if count >= n_calls:
            break
        s = s[: m.end(1)] + "\n" + m.group(3) + REGION_ARG.rstrip("\n") + s[m.end(1) :]
        count += 1
    open(p, "w", encoding="utf-8").write(s)
    print(p, "patched token-lines:", count, "| resolveEffectiveRegion calls:", n_calls)
