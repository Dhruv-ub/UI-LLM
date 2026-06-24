// import fs from 'fs';
// import path from 'path';
// import { pipeline, env } from '@xenova/transformers';
// import { PDFParse } from 'pdf-parse';
// import { OfficeParser } from 'officeparser';
// import { createWorker, createScheduler } from 'tesseract.js';
// import { fromBuffer } from 'pdf2pic';

// const EMBEDDING_MODEL = 'Xenova/bge-large-en-v1.5';
// const LOCAL_MODEL_PATH = '/home/hwpm/llm-frontent/UI-LLM/server/models';

// // ==========================================
// // OFFLINE MODEL CONFIGURATION
// // ==========================================
// env.allowRemoteModels = false; 
// env.allowLocalModels = true;
// env.localModelPath = LOCAL_MODEL_PATH;
// // ==========================================

// let extractor = null;
// let ocrScheduler = null;

// export const globalVectorStore = [];
// export const sessionVectorStore = new Map();

// // ==========================================
// // 1. INITIALIZE OCR WORKER POOL
// // ==========================================
// export const initOCR = async () => {
//     if (!ocrScheduler) {
//         console.log("[OCR] Initializing Tesseract Worker Pool (40 Cores)...");
//         ocrScheduler = createScheduler();
        
//         const NUM_CORES = 40; 

//         for (let i = 0; i < NUM_CORES; i++) {
//             const worker = await createWorker('eng', 1, {
//                 langPath: LOCAL_MODEL_PATH, 
//                 gzip: false,
//                 logger: () => {} 
//             });
//             ocrScheduler.addWorker(worker);
//         }
//         console.log(`[OCR] Scheduler ready with ${NUM_CORES} workers.`);
//     }
// };

// export const initEmbeddings = async () => {
//     if (!extractor) {
//         console.log(`[RAG] Loading ULTRA-STRONG model from local disk: ${EMBEDDING_MODEL}...`);
//         extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { 
//             quantized: false 
//         });
//         console.log("[RAG] Large Model loaded successfully into RAM.");
//     }
// };

// export const getEmbedding = async (text) => {
//     await initEmbeddings();
//     const output = await extractor(text, { pooling: 'mean', normalize: true });
//     return Array.from(output.data);
// };

// export const chunkText = (text, chunkSize = 300, overlap = 50) => {
//     const words = text.replace(/\s+/g, ' ').split(' ');
//     const chunks = [];
//     for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
//         if (words.slice(i, i + chunkSize).join(" ").trim().length > 0) {
//             chunks.push(words.slice(i, i + chunkSize).join(" "));
//         }
//     }
//     return chunks;
// };

// // ==========================================
// // 2. SCANNED PDF OCR PIPELINE
// // ==========================================
// // ==========================================
// // 2. SCANNED PDF OCR PIPELINE
// // ==========================================
// const extractTextFromScannedPDF = async (buffer, filename) => {
//     await initOCR();
//     console.log(`[OCR] Converting ${filename} to images for OCR...`);
    
//     const options = {
//         density: 300,
//         format: "png",
//         width: 2550, 
//         height: 3300
//     };
    
//     const storeAsImage = fromBuffer(buffer, options);
    
//     // FIX: Pass configuration object instead of 'true'
//     const pagesToProcess = await storeAsImage.bulk(-1, { responseType: "base64" }); 
    
//     console.log(`[OCR] Generated ${pagesToProcess.length} images. Distributing to CPU pool...`);
    
//     const ocrPromises = pagesToProcess.map(page => 
//         // Ensure we are pulling from the newly formatted response
//         ocrScheduler.addJob('recognize', `data:image/png;base64,${page.base64}`)
//     );
    
//     const results = await Promise.all(ocrPromises);
    
//     const fullText = results.map(result => result.data.text).join('\n\n');
//     console.log(`[OCR] OCR Complete for ${filename}. Extracted ${fullText.length} characters.`);
    
//     return fullText;
// };

// // Add this near your other configurations at the top of the file
// const FORCE_OCR_ALL_PDFS = true; // Change to true if you want to OCR absolutely everything

// // ==========================================
// // 3. ADVANCED UNIVERSAL PARSER
// // ==========================================
// export const parseDocument = async (fileData, filename) => {
//     const buffer = typeof fileData === 'string' ? fs.readFileSync(fileData) : fileData;
//     const ext = filename.split('.').pop().toLowerCase();

//     if (ext === 'pdf') {
//         // OVERRIDE: If you know all your docs are scanned, skip the digital check entirely.
//         if (FORCE_OCR_ALL_PDFS) {
//             console.log(`[RAG] FORCE_OCR is ON. Sending ${filename} directly to 40-Core OCR...`);
//             return await extractTextFromScannedPDF(buffer, filename);
//         }

//         const pdf = new PDFParse({ data: new Uint8Array(buffer) });
//         try {
//             const result = await pdf.getText();
            
//             // SMARTER THRESHOLD: A normal manual should have tens of thousands of characters. 
//             // If it returns less than 5000, it's 99% likely a scanned image with some leftover metadata.
//             if (result.text.trim().length < 5000) {
//                 console.log(`[RAG] Suspiciously low text count (${result.text.length} chars) for ${filename}. Engaging 40-Core OCR...`);
//                 return await extractTextFromScannedPDF(buffer, filename);
//             }
            
//             console.log(`[RAG] Extracted ${result.text.length} characters digitally from PDF: ${filename}`);
//             return result.text;
//         } catch(err) {
//              console.log(`[RAG] PDF parse failed for ${filename}, attempting OCR fallback...`);
//              return await extractTextFromScannedPDF(buffer, filename);
//         } finally {
//             await pdf.destroy();
//         }
//     } 
//     else if (ext === 'docx') {
//         try {
//             const ast = await OfficeParser.parseOffice(buffer);
//             const extractedText = ast.toText(); 
//             console.log(`[RAG] Extracted ${extractedText.length} characters from DOCX: ${filename}`);
//             return extractedText;
//         } catch (err) {
//             console.error(`[RAG] Error parsing DOCX:`, err);
//             return "";
//         }
//     } 
//     else {
//         return buffer.toString('utf-8');
//     }
// };

// // ==========================================
// // 4. INGESTION & SIMILARITY LOGIC
// // ==========================================
// export const ingestLocalDocuments = async () => {
//     const docsPath = path.join(process.cwd(), 'rag_docs');
//     if (!fs.existsSync(docsPath)) return;

//     const files = fs.readdirSync(docsPath).filter(file => 
//         file.endsWith('.pdf') || file.endsWith('.docx')
//     );
    
//     globalVectorStore.length = 0; 

//     for (const file of files) {
//         const filePath = path.join(docsPath, file);
//         try {
//             const text = await parseDocument(filePath, file);
            
//             if (text.trim().length === 0) {
//                  console.log(`[RAG] WARNING: ${file} contains 0 text characters.`);
//                  continue;
//             }

//             const chunks = chunkText(text);
//             for (let i = 0; i < chunks.length; i++) {
//                 const vector = await getEmbedding(chunks[i]);
//                 globalVectorStore.push({ source: `Global: ${file}`, text: chunks[i], vector });
//             }
//             console.log(`[RAG] ${file} globally embedded. (${chunks.length} chunks)`);
//         } catch (err) {
//             console.error(`[RAG] Error processing ${file}:`, err);
//         }
//     }
//     console.log(`[RAG] System ready! Holding ${globalVectorStore.length} chunks in RAM.`);
// };

// export const cosineSimilarity = (vecA, vecB) => {
//     let dotProduct = 0, normA = 0, normB = 0;
//     for (let i = 0; i < vecA.length; i++) {
//         dotProduct += vecA[i] * vecB[i];
//         normA += vecA[i] ** 2;
//         normB += vecB[i] ** 2;
//     }
//     return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
// };