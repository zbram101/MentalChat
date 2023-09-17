import Head from 'next/head'
import { useState, useRef, useEffect } from 'react'
import * as timeago from "timeago.js"
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  ConversationHeader,
  TypingIndicator
} from "@chatscope/chat-ui-kit-react"
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import { useChannel } from '@ably-labs/react-hooks'
import { Types } from "ably"

const topics = [
  "Help me feel less anxious",
  "Help me not feel sad",
  "Help me not feel alone",
  "Help me feel motivated",
  "Help me improve my relationship",
  "Help me feel more confident",
  "Help me cope with a loss",
  "Help me navigate a major life decision",
];
type MessageEntry = {
    message: string
    speaker: "bot" | "user"
    date: Date
    id?: string
    liked?: boolean
  }

  const updateChatbotMessage = (
    conversation: MessageEntry[],
    message: Types.Message
  ): MessageEntry[] => {
    const interactionId = message.data.interactionId;
  
    const updatedConversation = conversation.reduce(
      (acc: MessageEntry[], e: MessageEntry) => [
        ...acc,
        e.id === interactionId
          ? { ...e, message: e.message + message.data.token }
          : e,
      ],
      []
    );
  
    return conversation.some((e) => e.id === interactionId)
      ? updatedConversation
      : [
          ...updatedConversation,
          {
            id: interactionId,
            message: message.data.token,
            speaker: "bot",
            date: new Date(),
            liked: false,
          },
        ];
  };

export default function Home() {
  const [ text, setText ] = useState("")
  const [ conversation, setConversation] = useState<MessageEntry[]>([])
  const [ botIsTyping, setBotIsTyping] = useState<boolean>(false)
  const [ statusMessage, setStatusMessage] = useState<string>("Waiting for query...")
  const [ source, setSource] = useState<boolean>(false)
  const [ streaming, setStreaming] = useState<boolean>(true)
  const [ userId, setUserId] = useState<string>("")
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [ conversationStatus, setConversationSatus] = useState<string>("rootCauseIdentification")
  

  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => inputRef.current?.focus());

   useChannel(userId || 'default', (message) => {
    switch(message.data.event) {
      case "response": 
        setConversation((state) => updateChatbotMessage(state, message))
        break
      case "status":
        setStatusMessage(message.data.message)
        break
      case "responseEnd":
      default:
        setBotIsTyping(false)
        setStatusMessage("Waiting for query...")
    }
  })


  const handleStartNewConversation = async() => {
    setSelectedTopic(null); // Reset the selected topic to null
    setConversation([]); // Clear the conversation
    setText(""); // Clear the input text
    setStatusMessage("Waiting for query..."); // Reset the status message
    setBotIsTyping(false); // Set botIsTyping to false
    const response = await fetch("/api/endConversation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }), // Include the selected topic in the user input
    });
  };

  const handleTopicSelection = (topic: string) => {

    if(!userId) {
      alert("Please specify username.")
      return
   }

    setSelectedTopic(topic);

    // Add the selected topic as the first message in the conversation
    setConversation((state) => [
      {
        message: topic,
        speaker: "user",
        date: new Date(),
        liked: false,
      },
      ...state,
    ]);
    // Send the selected topic to the API
    sendUserInput(topic);
  };
  
  const sendUserInput = async (input: string) => {
    const userMessages = conversation.filter((data) => data.speaker === "user");
    const numberOfUserMessages = userMessages.length;
    let history = conversation.map((data) => data.message).reverse().join("\n");
    console.log(numberOfUserMessages,"conver",conversationStatus)
    try {
      setBotIsTyping(true);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ numberOfUserMessages, initialStatus: conversationStatus, history, query: input, userId, source, streaming }), // Include the selected topic in the user input
      });

      const responseData = await response.json();
      const newStatus = responseData.status; // Assuming the API returns the new status
      setConversationSatus(newStatus); // Update the conversation status
    } catch (error) {
      console.error("Error submitting message:", error);
    } finally {
      setBotIsTyping(false);
    }
  };

  const submit = async () => {
    if(!userId) {
       alert("Please specify username.")
       return
    }

    setConversation((state) => [
      ... state, {
        message: text,
        speaker: "user",
        date: new Date()
      }
    ])

    // Send the user input to the API
    sendUserInput(text);

    setText("")
  }

  return (
    <>
      <Head>
        <title>Mental Help</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
      <div style={{display: "flex"}}>
        <div style={{padding: "10px"}}> 
          <input type="checkbox" id="streaming" name="streaming" checked={streaming} onChange={() => setStreaming(!streaming)} />
          <label htmlFor="streaming">Streaming (word by word)</label>
        </div>
        <div style={{padding: "10px"}}>
          <input type="checkbox" id="source" name="source" checked={source} onChange={() => setSource(!source)} />
          <label htmlFor="source">Show Sources</label>
        </div>
        <div style={{padding: "6px"}}>
          Username <input type="text" value={userId} onChange={(e:any) => setUserId(e.target.value)}  style={{padding: "6px"}}/>
        </div>
         {selectedTopic ? (
            <div style={{ padding: "10px" }}>
              <button onClick={handleStartNewConversation}>Start New Conversation</button>
            </div>
        ): ( null )}
      </div>
      <div style={{ position: "relative", height: "92vh", overflow: "hidden" }}>
        {selectedTopic ? (
            // Show the chat container if a topic is selected
            <MainContainer>
              <ChatContainer>
                  <ConversationHeader>
                    <ConversationHeader.Actions></ConversationHeader.Actions>
                    <ConversationHeader.Content
                      userName="ChatBot"
                      info={statusMessage}
                    />
                  </ConversationHeader>
                  <MessageList
                    typingIndicator={
                      botIsTyping ? (
                        <TypingIndicator content="Bot is typing" />
                      ) : null
                    }
                  >
                    { 
                    conversation.map((entry, index) => {
                      return (
                        <Message
                          key={index}
                          style={{ width: "90%" }}
                          model={{
                            type: "custom",
                            sender: entry.speaker,
                            position: "single",
                            direction:
                              entry.speaker === "bot" ? "incoming" : "outgoing"
                          }}
                        >
                          <Message.CustomContent>
                          <span  dangerouslySetInnerHTML={{__html: entry.message}} />
                          </Message.CustomContent>
                          <Message.Footer
                            sentTime={timeago.format(entry.date)}
                            sender={entry.speaker === 'bot' ? "Bot": "You"}
                          />
                        </Message>
                      )
                    })
                    }
                  </MessageList>
                  <MessageInput
                    ref={inputRef}
                    placeholder='Type message here'
                    onSend={submit}
                    onChange={(e, text) => {
                      setText(text);
                    }}
                    sendButton={true}
                    disabled={botIsTyping}
                    style={{
                      backgroundColor:
                        conversationStatus === "rootCauseIdentification"
                          ? "#ccffcc" // Set the background color for rootCauseIdentification
                          : conversationStatus === "solutionTypeIdentification"
                          ? "#ffcccc" // Set the background color for solutionTypeIdentification
                          : "#cccccc", // Default background color
                    }}
                  />

                  {/* <MessageInput
                      ref={inputRef}
                      placeholder='Type message here'
                      onSend={submit}
                      onChange={(e, text) => {
                        setText(text)
                      }}
                      sendButton={true}
                      disabled={botIsTyping}
                  /> */}
              </ChatContainer>
            </MainContainer>
        ) : (
          // Show the topic selection dropdown if no topic is selected
          <div style={{ padding: "10px" }}>
            <h2>Select a Topic</h2>
            <select
              value={selectedTopic || ""}
              onChange={(e) => handleTopicSelection(e.target.value)}
            >
              <option value="" disabled>
                Choose a topic...
              </option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
        )}
       
        </div>
      </main>
    </>
  )
}
// import Head from 'next/head'
// import { useState, useRef, useEffect } from 'react'
// import * as timeago from "timeago.js"
// import {
//   MainContainer,
//   ChatContainer,
//   MessageList,
//   Message,
//   MessageInput,
//   ConversationHeader,
//   TypingIndicator
// } from "@chatscope/chat-ui-kit-react"
// import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
// import { useChannel } from '@ably-labs/react-hooks'
// import { Types } from "ably"

// const topics = [
//   "Help me feel less anxious",
//   "Help me not feel sad",
//   "Help me not feel alone",
//   "Help me feel motivated",
//   "Help me improve my relationship",
//   "Help me feel more confident",
//   "Help me cope with a loss",
//   "Help me navigate a major life decision",
// ];

// type MessageEntry = {
//   message: string
//   speaker: "bot" | "user"
//   date: Date
//   id?: string
//   liked?: boolean
// }

// type ProblemEntry = {
//   title: string
//   description: string
//   rootCauseIdentified: boolean
//   conversationID: string
//   messageID: string
// }

// type Conversation = {
//   messages: MessageEntry[]
//   problem: ProblemEntry[]
//   topic: "Help me feel less anxious" | "Help me not feel sad" | "Help me not feel alone" | "Help me feel motivated" | "Help me improve my relationship" | "Help me feel more confident" | "Help me cope with a loss" | "Help me navigate a major life decision"
//   status: "rootCauseIdentification" | "solutionTypeIdentification" | "shortTermSolution" | "completed"
// }
// const updateChatbotMessage = (
//   conversations: Conversation[],
//   message: Types.Message
// ): Conversation[] => {
//   const interactionId = message.data.interactionId;

//   // Find the active conversation based on the status
//   const activeConversationIndex = conversations.findIndex(
//     (conv) => conv.status === "rootCauseIdentification"
//   );

//   if (activeConversationIndex !== -1) {
//     const updatedConversation = [...conversations];

//     // Create a new MessageEntry for the received message and append it to the active conversation
//     const newMessageEntry: MessageEntry = {
//       message: message.data.token,
//       speaker: "bot",
//       date: new Date(),
//     };

//     updatedConversation[activeConversationIndex].messages.push(newMessageEntry);

//     return updatedConversation;
//   }

//   // If no active conversation found, return the original conversations
//   return conversations;
// };



// export default function Home() {
//   const [text, setText] = useState("")
//   const [conversation, setConversation] = useState<Conversation[]>([])
//   const [botIsTyping, setBotIsTyping] = useState<boolean>(false)
//   const [statusMessage, setStatusMessage] = useState<string>("Waiting for query...")
//   const [source, setSource] = useState<boolean>(false)
//   const [streaming, setStreaming] = useState<boolean>(true)
//   const [userId, setUserId] = useState<string>("")
//   const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

//   const inputRef = useRef<HTMLInputElement>(null);

//   useEffect(() => inputRef.current?.focus());

//   useChannel(userId || 'default', (message) => {
//     switch (message.data.event) {
//       case "response":
//         setConversation((state) => updateChatbotMessage(state, message))
//         break
//       case "status":
//         setStatusMessage(message.data.message)
//         break
//       case "responseEnd":
//       default:
//         setBotIsTyping(false)
//         setStatusMessage("Waiting for query...")
//     }
//   });

//  const handleStartNewConversation = async () => {
//   if (!userId) {
//     alert("Please specify username.");
//     return;
//   }

//   const activeConversationIndex = conversation.findIndex(
//     (conv) => conv.status === "rootCauseIdentification"
//   );

//   if (activeConversationIndex !== -1) {
//     const updatedConversation = [...conversation];

//     // Clear the active conversation and set the status to "rootCauseIdentification"
//     updatedConversation[activeConversationIndex].messages = [];
//     updatedConversation[activeConversationIndex].status = "rootCauseIdentification";

//     setConversation(updatedConversation);
//   }

//   setSelectedTopic(null); // Reset the selected topic to null
//   setText(""); // Clear the input text
//   setStatusMessage("Waiting for query..."); // Reset the status message
//   setBotIsTyping(false); // Set botIsTyping to false

//   const response = await fetch("/api/endConversation", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({ userId }),
//   });
// };

  
//   const handleTopicSelection = (topic: string) => {
//     if (!userId) {
//       alert("Please specify username.");
//       return;
//     }
  
//     const newConversation: Conversation = {
//       messages: [
//         {
//           message: topic,
//           speaker: "user",
//           date: new Date(),
//           liked: false,
//         },
//       ],
//       problem: [],
//       topic: topic as Conversation['topic'],
//       status: "rootCauseIdentification", // Set the correct status here
//     };
  
//     setConversation([newConversation]);
//     setSelectedTopic(topic);
//     sendUserInput(topic);
//   };
  

//   const sendUserInput = async (input: string) => {
//     let history = conversation.map((conv) => conv.messages.map((data) => data.message).reverse().join("\n"));
//     console.log(history, "conver");
//     try {
//       setBotIsTyping(true);
//       const response = await fetch("/api/chat", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ history, prompt: input, userId, source, streaming }), // Include the selected topic in the user input
//       });

//       await response.json();
//     } catch (error) {
//       console.error("Error submitting message:", error);
//     } finally {
//       setBotIsTyping(false);
//     }
//   };

//   const submit = async () => {
//     if (!userId) {
//       alert("Please specify username.")
//       return
//     }

//     const activeConversationIndex = conversation.findIndex(
//       (conv) => conv.status === "rootCauseIdentification"
//     );

//     if (activeConversationIndex !== -1) {
//       setConversation((state) => [
//         ...state,
//         {
//           message: text,
//           speaker: "user",
//           date: new Date(),
//         },
//       ] as Conversation[]);

//       // Send the user input to the API
//       sendUserInput(text);

//       setText("");
//     } else {
//       alert("Please select a topic before sending a message.");
//     }
//   }

//   return (
//     <>
//       <Head>
//         <title>Mental Help</title>
//         <meta name="description" content="Generated by create next app" />
//         <meta name="viewport" content="width=device-width, initial-scale=1" />
//         <link rel="icon" href="/favicon.ico" />
//       </Head>
//       <main>
//         <div style={{ display: "flex" }}>
//           <div style={{ padding: "10px" }}>
//             <input type="checkbox" id="streaming" name="streaming" checked={streaming} onChange={() => setStreaming(!streaming)} />
//             <label htmlFor="streaming">Streaming (word by word)</label>
//           </div>
//           <div style={{ padding: "10px" }}>
//             <input type="checkbox" id="source" name="source" checked={source} onChange={() => setSource(!source)} />
//             <label htmlFor="source">Show Sources</label>
//           </div>
//           <div style={{ padding: "6px" }}>
//             Username <input type="text" value={userId} onChange={(e: any) => setUserId(e.target.value)} style={{ padding: "6px" }} />
//           </div>
//           {selectedTopic ? (
//             <div style={{ padding: "10px" }}>
//               <button onClick={handleStartNewConversation}>Start New Conversation</button>
//             </div>
//           ) : (null)}
//         </div>
//         <div style={{ position: "relative", height: "92vh", overflow: "hidden" }}>
//           {selectedTopic ? (
//             // Show the chat container if a topic is selected
//             <MainContainer>
//               <ChatContainer>
//                 <ConversationHeader>
//                   <ConversationHeader.Actions></ConversationHeader.Actions>
//                   <ConversationHeader.Content
//                     userName="ChatBot"
//                     info={statusMessage}
//                   />
//                 </ConversationHeader>
//                 <MessageList
//                   typingIndicator={
//                     botIsTyping ? (
//                       <TypingIndicator content="Bot is typing" />
//                     ) : null
//                   }
//                 >
//                   {
//                     conversation.map((conv, index) => {
//                       return (
//                         <Message
//                           key={index}
//                           style={{ width: "90%" }}
//                           model={{
//                             type: "custom",
//                             sender: conv.messages[0].speaker,
//                             position: "single",
//                             direction:
//                               conv.messages[0].speaker === "bot" ? "incoming" : "outgoing"
//                           }}
//                         >
//                           <Message.CustomContent>
//                             <span dangerouslySetInnerHTML={{ __html: conv.messages.map((data) => data.message).join("<br>") }} />
//                           </Message.CustomContent>
//                           <Message.Footer
//                             sentTime={timeago.format(conv.messages[0].date)}
//                             sender={conv.messages[0].speaker === 'bot' ? "Bot" : "You"}
//                           />
//                         </Message>
//                       )
//                     })
//                   }
//                 </MessageList>
//                 <MessageInput
//                   ref={inputRef}
//                   placeholder='Type message here'
//                   onSend={submit}
//                   onChange={(e, text) => {
//                     setText(text)
//                   }}
//                   sendButton={true}
//                   disabled={botIsTyping}
//                 />
//               </ChatContainer>
//             </MainContainer>
//           ) : (
//             // Show the topic selection dropdown if no topic is selected
//             <div style={{ padding: "10px" }}>
//               <h2>Select a Topic</h2>
//               <select
//                 value={selectedTopic || ""}
//                 onChange={(e) => handleTopicSelection(e.target.value)}
//               >
//                 <option value="" disabled>
//                   Choose a topic...
//                 </option>
//                 {topics.map((topic) => (
//                   <option key={topic} value={topic}>
//                     {topic}
//                   </option>
//                 ))}
//               </select>
//             </div>
//           )}
//         </div>
//       </main>
//     </>
//   )
// }
