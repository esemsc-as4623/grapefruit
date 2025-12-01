import os
import requests
from typing import TypedDict, List, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END

# --- Configuration ---
API_URL = "http://localhost:8000"

# --- Tools (Client Side) ---

def search_amazon(query: str):
    """Searches the synthetic Amazon API."""
    try:
        response = requests.get(f"{API_URL}/search", params={"q": query})
        response.raise_for_status()
        return response.json()["results"]
    except Exception as e:
        return f"Error searching: {e}"

def checkout_amazon(items: List[dict]):
    """Places an order on the synthetic Amazon API.
    items should be a list of dicts with 'product_id' and 'quantity'.
    """
    try:
        response = requests.post(f"{API_URL}/cart/checkout", json=items)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return f"Error checking out: {e}"

# --- Agent State ---

class AgentState(TypedDict):
    messages: List[BaseMessage]
    cart: List[dict]
    status: str

# --- Nodes ---

def shopping_node(state: AgentState):
    """The brain of the agent. Decides whether to search, add to cart, or finish."""
    messages = state["messages"]
    cart = state.get("cart", [])
    
    # Simple prompt engineering for the demo
    system_prompt = """You are Akedo, an autonomous shopping assistant.
    You have access to a Synthetic Amazon API.
    
    Your goal is to fulfill the user's shopping request.
    
    1. If you don't know what product to buy, output 'SEARCH: <query>'.
    2. If you found a product and want to buy it, output 'BUY: <product_id> <quantity>'.
    3. If you have bought everything or cannot find items, output 'DONE: <summary>'.
    
    Current Cart: {cart}
    """
    
    # We use a lightweight model or just standard GPT-3.5/4
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # Construct the conversation
    prompt = [SystemMessage(content=system_prompt.format(cart=str(cart)))] + messages
    
    response = llm.invoke(prompt)
    return {"messages": [response], "status": "active"}

def tool_execution_node(state: AgentState):
    """Parses the LLM output and executes the mock API calls."""
    last_message = state["messages"][-1]
    content = last_message.content.strip()
    
    result_message = ""
    new_cart = state.get("cart", [])
    status = "active"

    if content.startswith("SEARCH:"):
        query = content.replace("SEARCH:", "").strip()
        results = search_amazon(query)
        result_message = f"API Search Results for '{query}':\n{results}"
        
    elif content.startswith("BUY:"):
        parts = content.replace("BUY:", "").strip().split()
        if len(parts) >= 2:
            product_id = parts[0]
            quantity = int(parts[1])
            
            # Execute checkout immediately for this demo (simplification)
            order_result = checkout_amazon([{"product_id": product_id, "quantity": quantity}])
            result_message = f"API Checkout Result: {order_result}"
            new_cart.append({"product_id": product_id, "quantity": quantity})
        else:
            result_message = "Error: Invalid BUY format."
            
    elif content.startswith("DONE:"):
        status = "finished"
        result_message = "Workflow completed."
    else:
        result_message = "I didn't understand that command. Please try again."

    return {
        "messages": [HumanMessage(content=result_message)], 
        "cart": new_cart,
        "status": status
    }

def should_continue(state: AgentState):
    if state["status"] == "finished":
        return END
    return "tools"

# --- Graph Construction ---

workflow = StateGraph(AgentState)
workflow.add_node("agent", shopping_node)
workflow.add_node("tools", tool_execution_node)

workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

app = workflow.compile()
