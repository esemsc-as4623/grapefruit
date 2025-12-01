import streamlit as st
import requests
import os
from langchain_core.messages import HumanMessage
from shopping_agent import app as agent_app

st.set_page_config(page_title="Akedo Live Demo", layout="wide")

st.title("🤖 Akedo: Autonomous Shopping Assistant")
st.markdown("### Live Demo with Synthetic Amazon API")

# --- Sidebar: Configuration ---
with st.sidebar:
    st.header("Configuration")
    
    # Default to ANTHROPIC_API_KEY from environment
    default_key = os.environ.get("ANTHROPIC_API_KEY", "")
    
    api_key = st.text_input("Anthropic API Key", value=default_key, type="password")
    if api_key:
        os.environ["ANTHROPIC_API_KEY"] = api_key
    
    st.divider()
    st.subheader("System Status")
    
    # Check Mock Server Status
    try:
        r = requests.get("http://localhost:8000/")
        if r.status_code == 200:
            st.success("🟢 Mock Retailer API: Online")
        else:
            st.error("🔴 Mock Retailer API: Error")
    except:
        st.error("🔴 Mock Retailer API: Offline")
        st.info("Please run `python mock_server.py` in a separate terminal.")

# --- Main Interface ---

if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Chat Input
if prompt := st.chat_input("What do you need to buy today?"):
    if not api_key:
        st.error("Please enter your OpenAI API Key in the sidebar.")
        st.stop()

    # Add user message to history
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Run Agent
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        full_response = ""
        
        # Initialize Agent State
        inputs = {"messages": [HumanMessage(content=prompt)], "cart": [], "status": "active"}
        
        # Stream the graph execution
        try:
            for output in agent_app.stream(inputs):
                for key, value in output.items():
                    # We look for the agent's thought process or tool outputs
                    if "messages" in value:
                        last_msg = value["messages"][-1]
                        content = last_msg.content
                        full_response += f"\n\n**[{key.upper()}]**: {content}"
                        message_placeholder.markdown(full_response)
        except Exception as e:
            st.error(f"An error occurred: {e}")
            
    st.session_state.messages.append({"role": "assistant", "content": full_response})

# --- Debugging / Audit Log ---
with st.expander("View Live API Traffic (Simulated)"):
    st.write("This section would show real-time logs from the mock_server if connected via websocket or shared log file.")
    st.info("Check the terminal running `mock_server.py` to see the incoming HTTP requests!")
