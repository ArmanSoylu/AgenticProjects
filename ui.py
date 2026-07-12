import streamlit as st
import requests

st.set_page_config(page_title="The Dreamer",page_icon="🤖",layout="centered")

st.title("The agentic Project Dreamer")
st.markdown("made with love and FastAPI")

#Session State
#Even if user refreshes the page the messages are being kept
if "messages" not in st.session_state:
    st.session_state["messages"] = []


#Showing the old messages
for message in st.session_state["messages"]:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

#Getting a question and sending to API
if prompt := st.chat_input("Ask a question to the Agent..."):
    #get memory from before
    st.chat_message("user").markdown(prompt)
    st.session_state.messages.append({"role": "user", "content": prompt})

    #spinner animation pplus show assistant answer

    with st.chat_message("asssistant"):
        with st.spinner("The Dreamer is thinking"):
            try:
                #connect to fast api server
                api_url = "http://127.0.0.1:8000/chat"

                #check with pydantic if the content is valid
                payload = {"query": prompt}

                response = requests.post(api_url, json=payload)

                #if works send code 200
                if response.status_code == 200:
                    agent_answer = response.json()["response"]
                    st.markdown(agent_answer)
                    #save the answer to ui history
                    st.session_state.messages.append({"role": "assistant", "content": agent_answer})
                else:
                    st.error(f"API error:Server has returned code {response.status_code}")

            except Exception as e:
                st.error(f"Could not connect to server make sure server.py is open and working error detail {e}")



