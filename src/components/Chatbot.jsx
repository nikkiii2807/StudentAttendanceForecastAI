import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, X, Loader2, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your AI assistant. You can ask me questions about student attendance, performance analysis, or any other related topics.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Debug log
  console.log('✅ Chatbot component is rendering!');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/groq-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userMessage }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize, but I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 0, 
      right: 0, 
      zIndex: 999999,
      pointerEvents: 'none'
    }}>
      {/* DEBUG: Visible marker */}
      <div style={{
        position: 'fixed',
        bottom: '100px',
        right: '20px',
        background: 'lime',
        color: 'black',
        padding: '10px',
        fontWeight: 'bold',
        border: '3px solid red',
        pointerEvents: 'auto',
        zIndex: 999999
      }}>
      
      </div>

      {/* Floating chat button */}
      <button
        onClick={() => {
          console.log('Chat button clicked! isOpen:', isOpen);
          setIsOpen(!isOpen);
        }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          backgroundColor: '#4f46e5',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          zIndex: 999999,
          pointerEvents: 'auto',
          transition: 'all 0.3s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.backgroundColor = '#4338ca';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.backgroundColor = '#4f46e5';
        }}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '90px',
          right: '20px',
          width: '384px',
          height: '500px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999999,
          pointerEvents: 'auto'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
            background: 'linear-gradient(to right, #6366f1, #a855f7)',
            borderRadius: '12px 12px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
              <Bot size={20} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>AI Assistant</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            backgroundColor: '#f9fafb',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {messages.map((message, index) => (
  <div
    key={index}
    style={{
      display: 'flex',
      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
    }}
  >
    <div
      style={{
        maxWidth: '80%',
        padding: '12px',
        borderRadius: '8px',
        backgroundColor: message.role === 'user' ? '#4f46e5' : 'white',
        color: message.role === 'user' ? 'white' : '#1f2937',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        fontSize: '14px',
        lineHeight: '1.5'
      }}
    >
      {message.role === 'assistant' ? (
        <ReactMarkdown>{message.content}</ReactMarkdown>
      ) : (
        message.content
      )}
    </div>
  </div>
))}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  backgroundColor: 'white',
                  padding: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: '#4f46e5' }} />
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} style={{
            padding: '16px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: 'white',
            borderRadius: '0 0 12px 12px'
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  opacity: (!input.trim() || isLoading) ? 0.5 : 1
                }}
              >
                <Send size={20} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Chatbot;