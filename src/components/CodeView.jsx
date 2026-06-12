import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import chatbotIcon from "../assets/llm.png";
import { API_BASE } from '../config';

export default function CodeView({ user, accessToken, onAuthClick, onLogoutClick, onRefreshToken }) {
 // Initialize state based on window size if possible, default to true for SSR safety
 const [isSidebarOpen, setIsSidebarOpen] = useState(true);
 const [conversations, setConversations] = useState([]);
 const [activeConvId, setActiveConvId] = useState(null);
 const [messages, setMessages] = useState([]);
 const [inputValue, setInputValue] = useState('');
 const [isGenerating, setIsGenerating] = useState(false);

 // Guest session state — ephemeral, lost on refresh (like ChatGPT/Gemini when not logged in)
 const [guestConversations, setGuestConversations] = useState([]);
 // Map of guestConvId -> messages array for in-memory history
 const guestMessagesRef = useRef({});
 const guestConvCounterRef = useRef(0);

 const isGuest = !user || !accessToken;

 // File Upload tracking
 const [attachedFile, setAttachedFile] = useState(null);
 const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
 const [isParsingFile, setIsParsingFile] = useState(false);

  // Stop / Edit state
  const [wasStopped, setWasStopped] = useState(false);
  const abortControllerRef = useRef(null);
  const lastUserPromptRef = useRef('');

 const messagesEndRef = useRef(null);
 const chatContainerRef = useRef(null);
 const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
 const isAutoScrollingRef = useRef(false);
 const textareaRef = useRef(null);
 const fileInputRef = useRef(null);
 const uploadMenuRef = useRef(null);

 // Auto-collapse sidebar on smaller screens
 useEffect(() => {
 const handleResize = () => {
 if (window.innerWidth < 768) {
 setIsSidebarOpen(false);
 } else {
 setIsSidebarOpen(true);
 }
 };

 // Set initial state
 handleResize();

 window.addEventListener('resize', handleResize);
 return () => window.removeEventListener('resize', handleResize);
 }, []);

 const fetchWithAuth = useCallback(async (url, options = {}) => {
 const headers = { ...options.headers };
 if (accessToken) {
 headers['Authorization'] = `Bearer ${accessToken}`;
 }

 let res;
 try {
 res = await fetch(url, { ...options, headers });
 } catch (err) {
 throw err;
 }

 if (accessToken && (res.status === 401 || res.status === 403) && onRefreshToken) {
 console.log('Token expired or unauthorized, attempting silent refresh...');
 const newToken = await onRefreshToken();
 if (newToken) {
 const retryHeaders = { ...options.headers };
 retryHeaders['Authorization'] = `Bearer ${newToken}`;
 res = await fetch(url, { ...options, headers: retryHeaders });
 }
 }
 return res;
 }, [accessToken, onRefreshToken]);

 const fetchConversations = useCallback(async () => {
 if (!user || !accessToken) return;
 try {
 const res = await fetchWithAuth(`${API_BASE}/conversations`);
 const data = await res.json();
 if (res.ok && data.status === 'success') {
 setConversations(data.conversations || []);
 }
 } catch (err) {
 console.error('Error fetching conversations:', err);
 }
 }, [user, accessToken, fetchWithAuth]);

 useEffect(() => {
 if (user && accessToken) {
 fetchConversations();
 // Clear guest session data when user logs in
 setGuestConversations([]);
 guestMessagesRef.current = {};
 guestConvCounterRef.current = 0;
 } else {
 setConversations([]);
 setActiveConvId(null);
 setMessages([]);
 }
 }, [user, accessToken, fetchConversations]);

 const fetchMessages = useCallback(async (convId) => {
 if (!accessToken) return;
 try {
 const res = await fetchWithAuth(`${API_BASE}/messages/${convId}`);
 const data = await res.json();
 if (res.ok && data.status === 'success') {
 setMessages(data.messages || []);
 }
 } catch (err) {
 console.error('Error fetching messages:', err);
 }
 }, [accessToken, fetchWithAuth]);

 // Load messages for active conversation (guest or authenticated)
 useEffect(() => {
 if (activeConvId && !isGenerating) {
 if (isGuest) {
 // Guest mode: load from in-memory store
 const guestMsgs = guestMessagesRef.current[activeConvId];
 if (guestMsgs) {
 setMessages([...guestMsgs]);
 } else {
 setMessages([]);
 }
 } else {
 fetchMessages(activeConvId);
 }
 } else if (!activeConvId) {
 setMessages([
 {
 message_id: 'welcome-1',
 role: 'assistant',
 content: `Hello! Welcome to **HWP_AI**. I am your professional AI assistant.\n\nThis dashboard is a fully interactive React user interface connected to a Node.js + Express backend.\n\n${user
 ? `**You are logged in as \`${user.username}\`**! All conversations you start in the sidebar will be preserved in your database.`
 : `**You are currently browsing anonymously**. Your chat history will be kept for this session only — it will be cleared when you refresh the page. Sign in to save conversations permanently.`
 }\n\nHow can I help you build today?`
 }
 ]);
 }
 }, [activeConvId, user, isGuest, fetchMessages, isGenerating]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = chatContainerRef.current;
    if (!container) return;
    isAutoScrollingRef.current = true;
    container.scrollTo({
      top: container.scrollHeight,
      behavior
    });
    // Reset the auto-scrolling flag after the scroll animation completes
    setTimeout(() => { isAutoScrollingRef.current = false; }, behavior === 'smooth' ? 400 : 50);
  }, []);

  // Smart auto-scroll: only scroll down if user hasn't scrolled up
  useEffect(() => {
    if (!isUserScrolledUp) {
      scrollToBottom(messages.length > 2 ? 'smooth' : 'auto');
    }
  }, [messages, isUserScrolledUp, scrollToBottom]);

  // Detect user scroll position
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Skip if this scroll was triggered by our auto-scroll
      if (isAutoScrollingRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // If user is more than 150px from bottom, they've scrolled up
      setIsUserScrolledUp(distanceFromBottom > 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

 useLayoutEffect(() => {
 const textarea = textareaRef.current;
 if (!textarea) return;
 textarea.style.height = '0px';
 textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
 }, [inputValue]);

 // Mobile Helper: Close sidebar on action
 const handleSidebarAction = () => {
 if (window.innerWidth < 768) setIsSidebarOpen(false);
 };

 const handleNewChat = async () => {
 handleSidebarAction();

 if (isGuest) {
 // Guest mode: just reset to welcome screen (don't create a new guest conv yet)
 setActiveConvId(null);
 return;
 }

 try {
 const res = await fetchWithAuth(`${API_BASE}/conversations`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({ title: 'New Conversation' })
 });
 const data = await res.json();
 if (res.ok && data.conversation_id) {
 setActiveConvId(data.conversation_id);
 fetchConversations();
 }
 } catch (err) {
 console.error('Error starting new chat:', err);
 }
 };

 const handleDeleteChat = async (e, convId) => {
 e.stopPropagation();

 if (isGuest) {
 // Guest mode: remove from in-memory store
 delete guestMessagesRef.current[convId];
 setGuestConversations(prev => prev.filter(c => c.conversation_id !== convId));
 if (activeConvId === convId) {
 setActiveConvId(null);
 }
 return;
 }

 if (!accessToken) return;

 try {
 const res = await fetchWithAuth(`${API_BASE}/conversations/${convId}`, {
 method: 'DELETE'
 });

 if (res.ok) {
 if (activeConvId === convId) {
 setActiveConvId(null);
 }
 fetchConversations();
 }
 } catch (err) {
 console.error('Error deleting conversation:', err);
 }
 };

 useEffect(() => {
 const handleClickOutside = (event) => {
 if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target)) {
 setIsUploadMenuOpen(false);
 }
 };
 if (isUploadMenuOpen) {
 document.addEventListener('mousedown', handleClickOutside);
 }
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, [isUploadMenuOpen]);

 const handleFileChange = async (e) => {
 const file = e.target.files[0];
 if (!file) return;
 e.target.value = '';
 setIsUploadMenuOpen(false);

 const ext = file.name.split('.').pop().toLowerCase();

 if (ext === 'pdf') {
 setIsParsingFile(true);
 try {
 const formData = new FormData();
 formData.append('file', file);
 // Use guest upload endpoint when not logged in
 const uploadUrl = isGuest ? `${API_BASE}/guest/upload` : `${API_BASE}/upload`;
 const fetchOpts = { method: 'POST', body: formData };
 const res = isGuest ? await fetch(uploadUrl, fetchOpts) : await fetchWithAuth(uploadUrl, fetchOpts);
 const data = await res.json();
 if (res.ok && data.status === 'success') {
 setAttachedFile({ name: data.filename, content: data.content });
 } else {
 console.error('Server PDF parse failed:', data.message);
 alert('Failed to parse PDF. Please try a different file.');
 }
 } catch (err) {
 console.error('PDF upload error:', err);
 alert('Could not upload PDF. Is the server running?');
 } finally {
 setIsParsingFile(false);
 }
 } else {
 const reader = new FileReader();
 reader.onload = (event) => {
 setAttachedFile({ name: file.name, content: event.target.result });
 };
 reader.readAsText(file);
 }
 };

  const handleStopGeneration = useCallback(() => {
  if (abortControllerRef.current) {
  abortControllerRef.current.abort();
  abortControllerRef.current = null;
  }
  setIsGenerating(false);
  setWasStopped(true);
  // Remove isTyping flag from all messages so the dots stop
  setMessages(prev => prev.map(m => m.isTyping ? { ...m, isTyping: false } : m));
  }, []);

  const handleEditPrompt = useCallback(() => {
  const prompt = lastUserPromptRef.current;
  if (!prompt) return;
  setInputValue(prompt);
  setWasStopped(false);
  // Focus the textarea after loading the prompt
  setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

 const handleSendMessage = async (e) => {
 if (e) e.preventDefault();
 if (!inputValue.trim() && !attachedFile) return;

 let currentConvId = activeConvId;
 let basePrompt = inputValue.trim();
 const currentFile = attachedFile;

 let promptToSend = basePrompt;
 if (currentFile) {
 promptToSend = `[Uploaded Document: ${currentFile.name}]\n\`\`\`text\n${currentFile.content}\n\`\`\`\n\nUser Question: ${basePrompt || "Analyze the provided document contents."}`;
 }

  // Store the raw user prompt for potential edit-and-resend
  lastUserPromptRef.current = basePrompt;

 setInputValue('');
 setAttachedFile(null);
 setIsGenerating(true);
  setWasStopped(false);

  // Create an AbortController for this request
  const controller = new AbortController();
  abortControllerRef.current = controller;

 // ===== GUEST MODE: ephemeral session-only chat =====
 if (isGuest) {
 // Auto-create a guest conversation if none is active
 if (!currentConvId) {
 guestConvCounterRef.current += 1;
 const guestId = `guest-${Date.now()}-${guestConvCounterRef.current}`;
 const titleExcerpt = basePrompt.length > 25
 ? basePrompt.substring(0, 25) + '...'
 : (currentFile ? `File: ${currentFile.name}` : 'New Chat');
 guestMessagesRef.current[guestId] = [];
 setGuestConversations(prev => [{ conversation_id: guestId, title: titleExcerpt, updated_at: new Date().toISOString() }, ...prev]);
 currentConvId = guestId;
 setActiveConvId(guestId);
 }

 const tempUserMsgId = `temp-user-${Date.now()}`;
 const tempAiMsgId = `temp-ai-${Date.now()}`;

 const userDisplayContent = currentFile
 ? `📄 **${currentFile.name}**\n\n${basePrompt}`
 : promptToSend;

 const userMessage = { message_id: tempUserMsgId, role: 'user', content: userDisplayContent };
 const assistantPlaceholder = { message_id: tempAiMsgId, role: 'assistant', content: '', isTyping: true };

 setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

 // Immediately save user message to in-memory ref so the useEffect
 // (which fires when isGenerating flips to false) won't wipe messages
 if (!guestMessagesRef.current[currentConvId]) guestMessagesRef.current[currentConvId] = [];
 guestMessagesRef.current[currentConvId].push({ ...userMessage });

 // Build chat history from in-memory store for context
 const sessionHistory = guestMessagesRef.current[currentConvId]
 .filter(m => m.message_id !== 'welcome-1')
 .map(m => ({ role: m.role, content: m.content }));

 try {
 const res = await fetch(`${API_BASE}/guest/messages`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 messages: sessionHistory,
 content: promptToSend
 }),
 signal: controller.signal
 });

 if (!res.ok) throw new Error('Streaming connection dropped');

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let done = false;
 let accumulatedResponse = '';

 while (!done) {
 const { value, done: doneReading } = await reader.read();
 done = doneReading;
 const chunk = decoder.decode(value);

 const lines = chunk.split('\n');
 for (const line of lines) {
 if (line.startsWith('data: ')) {
 const dataString = line.substring(6).trim();
 if (dataString === '[DONE]') {
 done = true;
 break;
 }
 try {
 const parsed = JSON.parse(dataString);
 if (parsed.chunk) {
 accumulatedResponse += parsed.chunk;
 setMessages((prev) =>
 prev.map((m) =>
 m.message_id === tempAiMsgId
 ? { ...m, content: accumulatedResponse, isTyping: false }
 : m
 )
 );
 }
 } catch (err) {
 // Ignore segmented lines
 }
 }
 }
 }

 // Save completed AI response to in-memory guest store
 guestMessagesRef.current[currentConvId].push({
 message_id: tempAiMsgId, role: 'assistant', content: accumulatedResponse
 });

 } catch (err) {
  if (err.name === 'AbortError') {
  // User clicked Stop — preserve partial response
  const partialContent = accumulatedResponse || '';
  if (partialContent && guestMessagesRef.current[currentConvId]) {
  guestMessagesRef.current[currentConvId].push({
  message_id: tempAiMsgId, role: 'assistant', content: partialContent
  });
  }
  setMessages(prev => prev.map(m =>
  m.message_id === tempAiMsgId ? { ...m, isTyping: false } : m
  ));
  } else {
  console.error('Guest streaming error:', err);
  const errorContent = 'Failed to retrieve response from server. Verify connection configurations.';
  setMessages((prev) =>
  prev.map((m) =>
  m.message_id === tempAiMsgId
  ? { ...m, content: errorContent, isTyping: false }
  : m
  )
  );
  // Also save error message to ref so useEffect won't wipe it
  guestMessagesRef.current[currentConvId].push({
  message_id: tempAiMsgId, role: 'assistant', content: errorContent
  });
  }
 } finally {
  abortControllerRef.current = null;
  setIsGenerating(false);
 }
 return;
 }

 // ===== AUTHENTICATED MODE: DB-persistent chat =====
 if (!currentConvId && user && accessToken) {
 try {
 const titleExcerpt = basePrompt.length > 25
 ? basePrompt.substring(0, 25) + '...'
 : (currentFile ? `File: ${currentFile.name}` : 'New Conversation');
 const res = await fetchWithAuth(`${API_BASE}/conversations`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ title: titleExcerpt })
 });
 const data = await res.json();

 if (res.ok && data.conversation_id) {
 currentConvId = data.conversation_id;
 setActiveConvId(currentConvId);
 await fetchConversations();
 }
 } catch (err) {
 console.error('Auto conversation creation failure:', err);
 setIsGenerating(false);
 return;
 }
 }

 const tempUserMsgId = `temp-user-${Date.now()}`;
 const tempAiMsgId = `temp-ai-${Date.now()}`;

 const userDisplayContent = currentFile
 ? `📄 **${currentFile.name}**\n\n${basePrompt}`
 : promptToSend;

 const userMessage = { message_id: tempUserMsgId, role: 'user', content: userDisplayContent };
 const assistantPlaceholder = { message_id: tempAiMsgId, role: 'assistant', content: '', isTyping: true };

 setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

 try {
 const res = await fetchWithAuth(`${API_BASE}/messages`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 conversation_id: currentConvId || 'anonymous-thread',
 content: promptToSend
 }),
 signal: controller.signal
 });

 if (!res.ok) throw new Error('Streaming connection dropped');

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let done = false;
 let accumulatedResponse = '';

 while (!done) {
 const { value, done: doneReading } = await reader.read();
 done = doneReading;
 const chunk = decoder.decode(value);

 const lines = chunk.split('\n');
 for (const line of lines) {
 if (line.startsWith('data: ')) {
 const dataString = line.substring(6).trim();
 if (dataString === '[DONE]') {
 done = true;
 break;
 }

 try {
 const parsed = JSON.parse(dataString);
 if (parsed.chunk) {
 accumulatedResponse += parsed.chunk;
 setMessages((prev) =>
 prev.map((m) =>
 m.message_id === tempAiMsgId
 ? { ...m, content: accumulatedResponse, isTyping: false }
 : m
 )
 );
 }
 } catch (err) {
 // Ignore segmented lines
 }
 }
 }
 }

 } catch (err) {
  if (err.name === 'AbortError') {
  // User clicked Stop — preserve partial response
  setMessages(prev => prev.map(m =>
  m.message_id === tempAiMsgId ? { ...m, isTyping: false } : m
  ));
  } else {
  console.error('Streaming error runtime fault:', err);
  setMessages((prev) =>
  prev.map((m) =>
  m.message_id === tempAiMsgId
  ? { ...m, content: 'Failed to retrieve response from server. Verify connection configurations.', isTyping: false }
  : m
  )
  );
  }
 } finally {
  abortControllerRef.current = null;
  setIsGenerating(false);
 }
 };

 return (
 // Changed to 100dvh to fix mobile bottom browser bars
 <div className="font-body-md text-body-md overflow-hidden h-[100dvh] flex w-full bg-background text-on-surface relative">
 <input
 type="file"
 ref={fileInputRef}
 onChange={handleFileChange}
 accept=".pdf,.csv,.txt,.log,.json,.js,.ts,.py,.cpp,.java,.html,.css,.md,.xml,.yaml,.yml,.sql,.sh,.bat,.env,.toml,.ini,.cfg"
 className="hidden"
 />

 {/* Mobile Backdrop Overlay */}
 {isSidebarOpen && (
 <div
 className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
 onClick={() => setIsSidebarOpen(false)}
 aria-hidden="true"
 />
 )}

 {/* Responsive Sidebar Shell */}
 <aside
 className={`fixed inset-y-0 left-0 md:relative h-[100dvh] bg-surface-container-low border-r border-outline-variant/10 shadow-2xl md:shadow-sm z-50 transition-all duration-300 flex flex-col ${isSidebarOpen
 ? 'translate-x-0 w-[280px] md:w-72'
 : '-translate-x-full md:translate-x-0 md:w-0 md:hidden'
 }`}
 >
 <div className="flex flex-col h-full p-4 md:p-md space-y-md overflow-hidden">
 {/* Header */}
 <div className="flex items-center gap-xs justify-between w-full">
 <div className="flex items-center gap-xs">
 <div className="w-13 h-13 rounded-lg bg-primary-container flex items-center justify-center overflow-hidden">
 <img src={chatbotIcon} />
 </div>
 <div>
 <h1 className="font-headline-lg text-[18px] md:text-headline-md font-bold text-primary" style={{ fontSize: "30px" }}>GaMa </h1>
 <span className="text-base md:text-lg font-bold"> &emsp; &nbsp; AI</span>
 </div>
 </div>
 {/* Mobile close button */}
 <button
 className="md:hidden text-on-surface-variant hover:text-on-surface p-1"
 onClick={() => setIsSidebarOpen(false)}
 >
 <span className="material-symbols-outlined">close</span>
 </button>
 </div>

 {/* New Chat CTA */}
 <button
 onClick={handleNewChat}
 className="w-full py-2.5 md:py-sm px-md flex items-center justify-center gap-xs bg-primary-container text-on-primary-container rounded-xl font-label-sm text-label-sm transition-all hover:opacity-90 active:scale-95 duration-200"
 >
 <span className="material-symbols-outlined">add</span>
 <span>New Chat</span>
 </button>

 {/* Search */}
 <div className="relative group mt-2">
 <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
 search
 </span>
 <input
 className="w-full bg-surface-container-high border-none rounded-lg py-2 md:py-xs pl-10 text-label-sm focus:ring-1 focus:ring-primary/50 placeholder:text-on-surface-variant/50 outline-none"
 placeholder="Search conversations..."
 type="text"
 />
 </div>

 {/* Scrollable Context Panel (History) */}
 <div className="flex-grow overflow-y-auto scrollbar-hide space-y-lg mt-md">
 {(() => {
  // Determine which conversation list to show
  const convList = user ? conversations : guestConversations;
  const sectionTitle = user ? 'Conversations' : 'Session History';

  return (
  <section>
  <h3 className="text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider mb-xs px-xs opacity-60">
  {sectionTitle}
  </h3>
  {!user && (
  <p className="text-[10px] text-on-surface-variant/40 px-xs mb-2 italic">
  Chat history is session-only. Sign in to save permanently.
  </p>
  )}
  <div className="space-y-1">
  {convList.length === 0 ? (
  <p className="text-[12px] text-on-surface-variant/50 px-2 py-4 italic text-center">
  {user ? 'No active conversations' : 'Start chatting to see history here'}
  </p>
  ) : (
  convList.map((conv) => (
  <div
  key={conv.conversation_id}
  onClick={() => {
  setActiveConvId(conv.conversation_id);
  handleSidebarAction();
  }}
  className={`rounded-lg p-2.5 md:p-sm flex items-center gap-xs cursor-pointer group transition-all ${activeConvId === conv.conversation_id
  ? 'bg-secondary-container text-on-secondary-container border border-outline-variant/20'
  : 'text-on-surface-variant hover:bg-surface-container-high'
  }`}
  >
  <span className="material-symbols-outlined text-[18px] md:text-[20px]">chat</span>
  <span className="truncate font-label-sm text-[13px] md:text-label-sm flex-grow">{conv.title}</span>
  <button
  onClick={(e) => handleDeleteChat(e, conv.conversation_id)}
  className="opacity-0 md:group-hover:opacity-100 p-0.5 rounded hover:bg-surface-container-highest transition-opacity lg:opacity-0"
  title="Delete Chat"
  >
  <span className="material-symbols-outlined text-[16px] text-error">delete</span>
  </button>
  </div>
  ))
  )}
  </div>
  </section>
  );
  })()}
 </div>

 {/* Footer profiles selector */}
 <div className="pt-md border-t border-outline-variant/10 pb-2 md:pb-0">
 {user ? (
 <div className="flex items-center gap-sm p-xs hover:bg-surface-container-high rounded-lg cursor-pointer transition-colors group">
 <div className="profile-avatar text-white font-bold w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary shrink-0">
 {user.username.charAt(0).toUpperCase()}
 </div>
 <div className="flex-grow min-w-0">
 <p className="font-label-sm text-label-sm text-on-surface font-semibold truncate">
 {user.username}
 </p>
 <p className="font-label-sm text-[11px] text-on-surface-variant truncate">
 {user.email}
 </p>
 </div>
 </div>
 ) : (
 <button
 onClick={onAuthClick}
 className="w-full py-2 bg-surface-container-highest border border-outline-variant/15 text-primary hover:text-white rounded-lg font-label-sm text-label-sm font-semibold flex items-center justify-center gap-2 transition-colors"
 >
 <span className="material-symbols-outlined text-[18px]">account_circle</span>
 <span>Access Account</span>
 </button>
 )}
 </div>
 </div>
 </aside>

 {/* Main Content Canvas */}
 <main className="flex-grow flex flex-col h-[100dvh] min-w-0 bg-surface">
 {/* Header toolbar */}
 <header className="flex justify-between items-center gap-2 md:gap-sm h-14 md:h-16 px-3 md:px-md w-full sticky top-0 z-30 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10">
 <div className="flex items-center gap-1 md:gap-sm min-w-0">
 <button
 onClick={() => setIsSidebarOpen(!isSidebarOpen)}
 className="text-on-surface hover:bg-surface-container-high p-1.5 md:p-2 rounded-lg transition-colors"
 >
 <span className="material-symbols-outlined text-[24px]">menu</span>
 </button>
 <div className="flex items-center gap-1 md:gap-xs bg-surface-container-high rounded-full px-2 py-1 md:px-sm md:py-xs border border-outline-variant/20 cursor-pointer hover:bg-surface-container-highest transition-colors min-w-0">
 <span className="material-symbols-outlined text-primary text-[16px] md:text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
 auto_awesome
 </span>
 <span className="font-label-sm text-[12px] md:text-label-sm text-on-surface whitespace-nowrap hidden sm:inline-block">HWP-1 Flash</span>
 <span className="material-symbols-outlined text-on-surface-variant text-[14px] md:text-[16px]">expand_more</span>
 </div>
 </div>

 <div className="hidden lg:flex items-center gap-lg">
 <a className="text-primary border-b-2 border-primary pb-1 font-label-sm text-label-sm" href="#">Workspace</a>
 <a
 className="text-white text-base font-xs hover:text-gray-200 transition-colors"
 href="#"
 >
 GAMA (Generative Assistant for Manuguru Analytics)
 </a>
 </div>

 <div className="flex items-center gap-1.5 md:gap-sm lg:gap-md min-w-0">
 {user ? (
 <div className="flex items-center gap-sm min-w-0">
 <span className="font-label-sm text-label-sm text-on-surface-variant hidden xl:inline-block max-w-40 truncate">
 Welcome, <strong>{user.username}</strong>
 </span>
 <button
 onClick={onLogoutClick}
 className="flex items-center gap-1 md:gap-xs px-2 md:px-sm py-1 md:py-1.5 bg-surface-container-highest hover:bg-error-container/20 hover:text-error text-on-surface rounded-lg font-label-sm text-[12px] md:text-label-sm border border-outline-variant/10 transition-all font-bold active:scale-95 duration-200"
 >
 <span className="material-symbols-outlined text-[16px] md:text-[18px]">logout</span>
 <span className="hidden sm:inline-block">Logout</span>
 </button>
 </div>
 ) : (
 <button
 onClick={onAuthClick}
 className="flex items-center gap-1 md:gap-xs px-2 md:px-sm py-1 md:py-1.5 bg-primary text-on-primary rounded-lg font-label-sm text-[12px] md:text-label-sm hover:opacity-90 transition-all font-bold shadow-lg transform active:scale-95 duration-200"
 >
 <span className="material-symbols-outlined text-[16px] md:text-[18px]">login</span>
 <span className="hidden sm:inline-block">Sign In</span>
 </button>
 )}

 <div className="flex items-center gap-1 md:gap-xs ml-1">
 <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-on-surface text-[20px] md:text-[24px]">notifications</span>
 <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-on-surface text-[20px] md:text-[24px] md:hidden">account_circle</span>
 </div>
 </div>
 </header>

 {/* Chat Content Scroll Canvas */}
 <div className="relative flex-1 min-h-0">
          <div ref={chatContainerRef} className="h-full overflow-y-auto chat-scrollbar pb-2">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:gap-6 px-3 md:px-md py-4 md:py-lg lg:px-10 xl:px-16">
            {messages.map((msg) => {
              const isLastUserMsg = msg.role === 'user' && msg.message_id === messages.filter(m => m.role === 'user').at(-1)?.message_id;
              return (
              <div key={msg.message_id || msg.id}>
              {msg.role === 'user' ? (
              <div className="flex justify-end animate-in slide-in-from-right-4 duration-500 my-1 md:my-2 group/user-msg">
              <div className="flex items-end gap-1.5 w-full justify-end">
              {/* Edit icon — only on the last user message when generation was stopped */}
              {wasStopped && !isGenerating && isLastUserMsg && (
              <button
              type="button"
              onClick={handleEditPrompt}
              className="edit-prompt-btn mb-1"
              title="Edit and resend prompt"
              aria-label="Edit and resend prompt"
              >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
              </button>
              )}
              <div className="w-fit max-w-[92%] sm:max-w-[85%] lg:max-w-[75%] glass-panel rounded-2xl rounded-tr-none p-3 md:p-md text-on-surface">
              <div className="font-body-md text-[14px] md:text-body-md whitespace-pre-wrap break-words">
              <ReactMarkdown children={msg.content} />
              </div>
              </div>
              </div>
              </div>
              ) : (
              <div className="flex justify-start gap-2 md:gap-md animate-in slide-in-from-left-4 duration-700 my-2 md:my-4">
              <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-xl bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center ai-glow mt-1">
              <span className="material-symbols-outlined text-white text-[18px] md:text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              auto_awesome
              </span>
              </div>
              <div className="max-w-[88%] sm:max-w-[85%] lg:max-w-[82%] w-full space-y-md">
              <div className="space-y-2 md:space-y-sm text-on-surface">
              <div className="font-body-md text-[14px] md:text-body-md opacity-90 break-words leading-relaxed md:leading-7 markdown-container">
              <ReactMarkdown
              children={msg.content}
              components={{
              code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
              <div className="my-3 md:my-4 overflow-hidden rounded-xl border border-outline-variant/20 shadow-2xl">
              <div className="flex items-center justify-between bg-surface-container-high px-3 md:px-md py-2 md:py-xs font-label-sm text-[11px] md:text-label-sm text-on-surface-variant border-b border-outline-variant/15">
              <span className="font-mono uppercase tracking-wider">{match[1]}</span>
              <button
              type="button"
              onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ''))}
              className="flex items-center gap-1 hover:text-on-surface transition-colors font-semibold"
              >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
              <span className="hidden sm:inline-block">Copy</span>
              </button>
              </div>
              <SyntaxHighlighter
              {...props}
              children={String(children).replace(/\n$/, '')}
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{
              margin: 0,
              padding: '1rem',
              fontSize: '0.8rem',
              background: '#121212',
              overflowX: 'auto'
              }}
              />
              </div>
              ) : (
              <code className="bg-surface-container-highest px-1.5 py-0.5 rounded font-mono text-[12px] md:text-sm border border-outline-variant/20 break-words" {...props}>
              {children}
              </code>
              );
              },
              p: ({ children }) => <p className="mb-3 md:mb-4 last:mb-0 whitespace-pre-wrap">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 md:pl-md space-y-1 mb-3 md:mb-4">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 md:pl-md space-y-1 mb-3 md:mb-4">{children}</ol>,
              li: ({ children }) => <li className="marker:text-primary">{children}</li>,
              h1: ({ children }) => <h1 className="text-xl md:text-2xl font-bold mt-4 md:mt-md mb-2 text-primary">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg md:text-xl font-bold mt-3 md:mt-sm mb-2 text-secondary">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base md:text-lg font-bold mt-2 md:mt-sm mb-1">{children}</h3>,
              }}
              />
              </div>
              {msg.isTyping && (
              <div className="flex gap-1.5 items-center py-2">
              <span className="w-2 md:w-2.5 h-2 md:h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
              <span className="w-2 md:w-2.5 h-2 md:h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 md:w-2.5 h-2 md:h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
              </div>
              )}
              </div>
              </div>
              </div>
              )}
              </div>
              );
            })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Scroll to bottom button */}
          {isUserScrolledUp && (
            <button
              onClick={() => {
                setIsUserScrolledUp(false);
                scrollToBottom('smooth');
              }}
              className="scroll-to-bottom-btn"
              title="Scroll to bottom"
              aria-label="Scroll to bottom"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>keyboard_arrow_down</span>
            </button>
          )}
        </div>

 {/* Form Interactive Input Control Tray */}
 <div className="sticky bottom-0 z-20 w-full border-t border-outline-variant/10 bg-surface/90 md:bg-gradient-to-t md:from-surface md:via-surface/96 md:to-surface/75 backdrop-blur-xl">
 <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-2 md:px-md pb-2 md:pb-3 pt-2 md:pt-4 lg:px-10 xl:px-16">

 {attachedFile && (
 <div className="w-full flex justify-start mb-2 md:mb-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
 <div className="flex items-center gap-1 md:gap-xs px-2 md:px-sm py-1 md:py-1.5 bg-primary-container/20 text-primary border border-primary/20 rounded-xl font-label-sm text-[12px] md:text-label-sm">
 <span className="material-symbols-outlined text-[14px] md:text-[16px]">description</span>
 <span className="font-semibold truncate max-w-[150px] md:max-w-xs">{attachedFile.name}</span>
 <button
 type="button"
 onClick={() => setAttachedFile(null)}
 className="ml-1 md:ml-xs w-5 h-5 md:w-4 md:h-4 rounded-full flex items-center justify-center hover:bg-primary/20 transition-colors"
 >
 <span className="material-symbols-outlined text-[14px] md:text-[12px] font-bold">close</span>
 </button>
 </div>
 </div>
 )}

 <form
 onSubmit={handleSendMessage}
 className="w-full glass-panel p-1 md:p-xs rounded-2xl shadow-xl md:shadow-2xl flex flex-col gap-1 transition-all focus-within:ring-1 focus-within:ring-primary/40 bg-surface md:bg-transparent"
 >
 <textarea
 ref={textareaRef}
 value={inputValue}
 onChange={(e) => setInputValue(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 // Optional check on mobile to allow enter-to-send only if they prefer, but standard is keep it
 if (window.innerWidth > 768 || e.ctrlKey) handleSendMessage();
 }
 }}
 className="w-full bg-transparent border-none focus:ring-0 text-[14px] md:text-body-md text-on-surface placeholder:text-on-surface-variant/40 resize-none min-h-[40px] max-h-[150px] md:max-h-[220px] overflow-y-auto px-3 py-2.5 md:px-sm md:py-2 outline-none"
 placeholder={user ? "Ask HWP_AI anything..." : "Ask anything — session only..."}
 rows={1}
 />
 <div className="flex justify-between items-center px-2 md:px-sm pb-1 md:pb-sm">
 <div className="flex items-center gap-1 md:gap-sm">
 <div className="relative" ref={uploadMenuRef}>
 <button
 type="button"
 onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
 className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${isUploadMenuOpen
 ? 'text-primary bg-primary-container/30 ring-1 ring-primary/30'
 : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
 }`}
 title="Attach files"
 >
 <span className="material-symbols-outlined text-[20px] md:text-[20px]" style={{
 transform: isUploadMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
 transition: 'transform 0.2s ease'
 }}>add</span>
 </button>

 {isUploadMenuOpen && (
 <div className="absolute bottom-full left-0 mb-2 w-48 md:w-56 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden z-50"
 style={{ animation: 'dropdownSlideUp 0.2s ease-out' }}
 >
 <div className="p-1 md:p-1.5">
 <button
 type="button"
 onClick={() => {
 fileInputRef.current.click();
 }}
 disabled={isParsingFile}
 className="w-full flex items-center gap-2 md:gap-sm px-2 md:px-sm py-2 md:py-2.5 rounded-lg text-on-surface hover:bg-surface-container-highest transition-colors text-left group"
 >
 <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary-container/30 flex items-center justify-center group-hover:bg-primary-container/50 transition-colors shrink-0">
 <span className="material-symbols-outlined text-primary text-[16px] md:text-[18px]">upload_file</span>
 </span>
 <div className="min-w-0">
 <p className="font-label-sm text-[12px] md:text-label-sm font-semibold truncate">
 {isParsingFile ? 'Parsing...' : 'Upload file'}
 </p>
 <p className="text-[10px] md:text-[11px] text-on-surface-variant/60 truncate">PDF, CSV, Code</p>
 </div>
 </button>
 </div>
 </div>
 )}
 </div>
 <button
 type="button"
 className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-lg transition-colors"
 >
 <span className="material-symbols-outlined text-[20px]">mic</span>
 </button>
 <div className="hidden sm:block h-4 w-[1px] bg-outline-variant/30 mx-1 md:mx-xs"></div>
 <div className="hidden sm:flex items-center gap-xs px-2 py-1 bg-surface-container-high rounded-md text-on-surface-variant text-[11px] font-label-sm border border-outline-variant/10 cursor-pointer">
 <span className="material-symbols-outlined text-[14px]">public</span>
 Search
 </div>
 </div>
  {isGenerating ? (
  <button
  type="button"
  onClick={handleStopGeneration}
  className="send-stop-btn stop-active"
  title="Stop generating"
  >
  <span className="material-symbols-outlined text-[18px] md:text-[20px]">stop</span>
  </button>
  ) : (
  <button
  type="submit"
  disabled={!inputValue.trim() && !attachedFile}
  className="send-stop-btn send-active"
  >
  <span className="material-symbols-outlined text-[18px] md:text-[24px]">arrow_upward</span>
  </button>
  )}
 </div>
 </form>
 <p className="mt-1 md:mt-sm text-[9px] md:text-[11px] text-on-surface-variant/40 font-label-sm mb-1 text-center">
 AetherAI can make mistakes. Verify important information.
 </p>
 </div>
 </div>
 </main>
 </div>
 );
}