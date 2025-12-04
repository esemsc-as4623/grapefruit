# LLM Prompts

This directory contains all system prompts used for LLM-based receipt processing and inventory matching.

## Files

### `receipt_parsing.txt`
**Purpose:** Extract structured grocery items from raw receipt text

**Used by:** `backend/src/services/receiptParser.js` → `parseWithLLM()`

**Model recommendation:** Llama 3.2 1B/3B, Phi-3 Mini

**Configuration:** See `backend/src/config/llm.js` → `LLM_CONFIG.receiptParsing`

---

### `item_matching.txt`
**Purpose:** Semantically match parsed receipt items to existing inventory

**Used by:** `backend/src/services/inventoryMatcher.js` → `matchWithLLM()`

**Model recommendation:** Phi-3 Mini 3.8B, Llama 3.2 3B

**Configuration:** See `backend/src/config/llm.js` → `LLM_CONFIG.itemMatching`

---

### `cart_pricing.txt`
**Purpose:** Suggest reasonable quantities and units for items added to cart

**Used by:** `backend/src/services/cartPricer.js` → `suggestPriceAndQuantity()`

**Model recommendation:** asi1-mini (ASI Cloud), Llama 3.2 3B, Phi-3 Mini

**Configuration:** See `backend/src/config/llm.js` → `LLM_CONFIG.cartPricing`

**Important Note:** 
- LLM suggests: `quantity`, `unit`, `category`
- Catalog provides: `price` (from `amazon_catalog` table via `priceService.js`)
- This separation ensures AI-powered convenience with accurate pricing
- See `backend/ARCHITECTURE.md` for detailed explanation

---

## How to Modify Prompts

1. **Edit the .txt file directly** - Changes are automatically loaded
2. **Format:** Each file has a header with metadata, then a marker line, then the actual prompt
3. **Marker line:** `# SYSTEM PROMPT BELOW (copy everything after this line)`
4. **The prompt loader** extracts only the text after the marker line

## Prompt Guidelines

### For Receipt Parsing:
- Be very explicit about output format (JSON structure)
- Include examples of edge cases (weight items, multi-packs, returns)
- Specify confidence thresholds clearly
- List non-grocery items to skip

### For Item Matching:
- Emphasize semantic similarity over exact matching
- Clearly define unit compatibility rules
- Provide confidence score guidelines
- Include example matches and non-matches

### For Cart Pricing:
- Use current market prices from major retailers (Walmart, Amazon)
- Suggest realistic household quantities
- Provide confidence scores for pricing accuracy
- Include reasoning for transparency

## Testing Prompts

You can test prompts without modifying code:

```bash
# Using Ollama CLI
ollama run llama3.2:1b

# Then paste the system prompt + your test data
```

Or use the API directly:

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2:1b",
  "prompt": "MILK 1GAL $3.79\nEGGS 12CT $2.49",
  "system": "...paste system prompt here...",
  "format": "json",
  "stream": false
}'
```

## Hot Reloading

Prompts are loaded when the server starts. To reload without restarting:

```javascript
const { reloadPrompts } = require('./src/config/llm');
reloadPrompts();
```

## Version Control

- ✅ **DO** commit prompt changes to git
- ✅ **DO** document major prompt changes in commit messages
- ✅ **DO** test prompts before committing
- ❌ **DON'T** include API keys or sensitive data in prompts

## Best Practices

1. **Keep prompts focused** - One task per prompt
2. **Use examples** - LLMs learn better from examples
3. **Be specific about format** - JSON structure, field names, types
4. **Set expectations** - Confidence thresholds, edge cases
5. **Test with real data** - Use receipts from `/examples/` folder

## Troubleshooting

**Problem:** Prompts not loading
- Check file path is correct
- Verify marker line is present
- Check file encoding (should be UTF-8)

**Problem:** LLM not following instructions
- Make instructions more explicit
- Add more examples
- Try a different model (Phi-3 often better at instruction following)
- Lower temperature for more consistent output

**Problem:** Poor accuracy
- Add more edge cases to the prompt
- Increase temperature slightly for creative matching
- Use a larger model (3B instead of 1B)
- Fine-tune the prompt with real examples

## Related Files

- `backend/src/config/llm.js` - Model selection and parameters
- `backend/src/services/receiptParser.js` - Receipt parsing logic
- `backend/src/services/inventoryMatcher.js` - Item matching logic
- `docs/LLM_INTEGRATION.md` - Complete LLM setup guide

## Contributing

When modifying prompts:
1. Test with at least 5 different receipts from `/examples/`
2. Document what changed and why
3. Note any accuracy improvements/regressions
4. Update this README if adding new prompts
