from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import random
import uvicorn

app = FastAPI(title="Synthetic Amazon API", description="A minimalist mock API for demo purposes")

# --- Mock Data ---
MOCK_INVENTORY = [
    {"id": "amz_001", "name": "Echo Dot (5th Gen)", "price": 49.99, "category": "Electronics", "rating": 4.7},
    {"id": "amz_002", "name": "Kindle Paperwhite", "price": 139.99, "category": "Electronics", "rating": 4.8},
    {"id": "amz_003", "name": "Amazon Basics AA Batteries (48 Pack)", "price": 15.49, "category": "Household", "rating": 4.6},
    {"id": "amz_004", "name": "Hanes Men's T-Shirt", "price": 12.00, "category": "Apparel", "rating": 4.3},
    {"id": "amz_005", "name": "Sony WH-1000XM5 Headphones", "price": 348.00, "category": "Electronics", "rating": 4.8},
    {"id": "amz_006", "name": "Instant Pot Duo 7-in-1", "price": 99.95, "category": "Kitchen", "rating": 4.7},
    {"id": "amz_007", "name": "Harry Potter Box Set", "price": 55.00, "category": "Books", "rating": 4.9},
    {"id": "amz_008", "name": "Logitech MX Master 3S", "price": 99.99, "category": "Electronics", "rating": 4.8},
]

class CartItem(BaseModel):
    product_id: str
    quantity: int

class Order(BaseModel):
    items: List[CartItem]
    total_price: float
    status: str

# --- Endpoints ---

@app.get("/")
def read_root():
    return {"status": "online", "message": "Welcome to the Synthetic Amazon API"}

@app.get("/search")
def search_products(q: str):
    """Simulates searching for products."""
    q = q.lower()
    results = [p for p in MOCK_INVENTORY if q in p["name"].lower() or q in p["category"].lower()]
    return {"results": results}

@app.get("/product/{product_id}")
def get_product(product_id: str):
    """Get details for a specific product."""
    for p in MOCK_INVENTORY:
        if p["id"] == product_id:
            return p
    raise HTTPException(status_code=404, detail="Product not found")

@app.post("/cart/checkout")
def checkout(cart: List[CartItem]):
    """Simulates a checkout process."""
    total = 0.0
    for item in cart:
        product = next((p for p in MOCK_INVENTORY if p["id"] == item.product_id), None)
        if product:
            total += product["price"] * item.quantity
    
    return {
        "order_id": f"ord_{random.randint(10000, 99999)}",
        "status": "confirmed",
        "total_charged": round(total, 2),
        "message": "Order placed successfully on Synthetic Amazon"
    }

if __name__ == "__main__":
    # Run on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
