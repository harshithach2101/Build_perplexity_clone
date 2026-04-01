import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

# Check if .env exists
if not os.path.exists('.env'):
    print("FATAL ERROR: .env file missing in project root!")
else:
    print(".env file detected. Loading configurations...")
    load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

@app.route('/')
def home():
    return render_template('index.html')

# Configure Gemini AI
api_key = os.getenv("GEMINI_API_KEY")

if api_key and "AIza" in api_key:
    try:
        genai.configure(api_key=api_key)
        # Model configuration
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 4096,
        }

        # SYSTEM INSTRUCTION for 'Mini ChatGPT' Persona
        SYSTEM_INSTRUCTION = """
        You are Harshi AI, a world-class, brilliant, and helpful AI assistant. 
        You are highly creative, technically genius, and always aim to provide precise, high-quality answers.
        Your reasoning should be deep but your responses should be concise and easy to read.
        Use Markdown formatting beautifully (bolding, lists, code blocks, tables).
        Always identify as Harshi AI if asked.
        """

        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash-latest", 
            generation_config=generation_config,
            system_instruction=SYSTEM_INSTRUCTION
        )
        MOCK_MODE = False
        print("Backend Status: LIVE (Gemini 2.5 Flash)")
    except Exception as e:
        print(f"Gemini Init Error: {e}")
        MOCK_MODE = True
else:
    MOCK_MODE = True
    print("Backend Status: MOCK (Key missing or invalid)")

# Simple in-memory chat sessions
chat_sessions = {}

import io
import pypdf
import base64

def extract_text_from_pdf(base64_pdf):
    try:
        # Decode base64
        pdf_data = base64.b64decode(base64_pdf)
        pdf_file = io.BytesIO(pdf_data)
        
        # Read PDF
        reader = pypdf.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        print(f"PDF Extraction Error: {e}")
        return None

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON payload received"}), 400
            
        user_message = data.get('message', '').strip()
        session_id = data.get('session_id', 'default_user')
        file_data = data.get('file')
        
        if not user_message and not file_data:
            return jsonify({"error": "Message or file is empty"}), 400
        
        if MOCK_MODE:
            return jsonify({"response": "Mock PDF Response", "status": "success", "session_id": session_id})
        
        # Extract user settings
        user_settings = data.get('settings', {})
        temperature = user_settings.get('temperature', 0.5)
        max_tokens = user_settings.get('maxTokens', 2000)
        
        # Real AI Interaction (Multi-modal & Simple RAG)
        # Use the model selected by the user, defaulting to 1.5 Flash
        model_id = user_settings.get('model', 'gemini-1.5-flash-latest')

        # Create or reuse model instance based on selection
        current_model = genai.GenerativeModel(
            model_name=model_id,
            generation_config=generation_config,
            system_instruction=SYSTEM_INSTRUCTION
        )
        
        if session_id not in chat_sessions:
            chat_sessions[session_id] = current_model.start_chat(history=[])
            
        chat_session = chat_sessions[session_id]
        
        # Assemble message parts
        message_parts = []
        pdf_context = ""

        if file_data:
            mime = file_data['mime_type']
            
            # Simple RAG Logic for PDFs
            if "pdf" in mime:
                pdf_text = extract_text_from_pdf(file_data['data'])
                if pdf_text:
                    pdf_context = f"\n\n[DOCUMENT CONTEXT FROM {file_data['name']}]:\n{pdf_text}\n\n"
                    print(f"RAG: Extracted {len(pdf_text)} chars from PDF.")
            
            # Media Part for Vision (Images)
            elif "image" in mime:
                message_parts.append({
                    "mime_type": mime,
                    "data": file_data['data']
                })
            
        # Add text part with injected RAG context
        final_prompt = user_message
        if pdf_context:
            final_prompt = f"Using the following context, please answer the user's request. {pdf_context} \nUSER QUESTION: {user_message}"
            
        if final_prompt:
            message_parts.append(final_prompt)
        
        # Send message with dynamic config
        response = chat_session.send_message(
            message_parts,
            generation_config=genai.types.GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_tokens
            )
        )
        
        return jsonify({
            "response": response.text,
            "status": "success",
            "session_id": session_id
        })
    except Exception as e:
        print(f"RAG/AI Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reset', methods=['POST'])
def reset_chat():
    try:
        data = request.get_json()
        session_id = data.get('session_id', 'default_user') if data else 'default_user'
        if session_id in chat_sessions:
            del chat_sessions[session_id]
        return jsonify({"status": "success", "message": "History cleared"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Listen on all local interfaces for better accessibility
    app.run(debug=True, host='0.0.0.0', port=5000)
