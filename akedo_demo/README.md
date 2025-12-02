# Akedo Live Demo

This is a minimalist implementation of the Akedo Autonomous Shopping Assistant, featuring a **Synthetic Amazon API** for live integration demos.

## Prerequisites

1.  **Python 3.10+**
2.  **OpenAI API Key**

## Installation

```bash
cd akedo_demo
pip install -r requirements.txt
```

## Running the Demo

You need to run **two** separate processes (terminals) to simulate the "Live API" environment.

### Terminal 1: The Synthetic Retailer API
This starts the mock server that simulates Amazon/Walmart.

```bash
python mock_server.py
```
*You should see: `Uvicorn running on http://0.0.0.0:8000`*

### Terminal 2: The Akedo Shopping Assistant
This starts the user interface and the autonomous agent.

```bash
streamlit run demo_ui.py
```

## Usage

1.  Open the Streamlit URL (usually `http://localhost:8501`).
2.  Enter your OpenAI API Key in the sidebar.
3.  Ensure the "Mock Retailer API" status is **🟢 Online**.
4.  Type a request like:
    *   *"Find me some cheap headphones"*
    *   *"Buy 2 packs of AA batteries"*
    *   *"I need a gift for a book lover"*

The agent will autonomously search the mock API, decide what to buy, and place an order. You can watch the API logs in Terminal 1 to see the "live" traffic!
