import axios from "axios";
import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express"; 
import {v2 as cloudinary} from 'cloudinary';
import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import FormData from 'form-data';


const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const generateArticle = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {prompt, length} = req.body;
        const plan = req.plan;
        const freeUsage = req.free_usage 

        // Check if user has exceeded free usage
        if (plan !== 'premium' && freeUsage >= 10) {
            return res.status(403).json({ message: 'Free usage limit exceeded. Upgrade to premium for more requests.' });
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: length,
        });
        
        const content = response.choices[0].message.content

        // Save to database
        await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'article')`;

        // Update free usage (INCREMENT, not decrement)
        if(plan !== 'premium'){
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    freeUsage: freeUsage + 1 // INCREMENT by 1, not subtract 10
                }
            });
        }
        
        res.json({success: true, content});
        
    } catch (error) {
        console.error('Error generating article:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

export const generateBlogTitle = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {prompt} = req.body;
        const plan = req.plan;
        const freeUsage = req.free_usage 

        // Check if user has exceeded free usage
        if (plan !== 'premium' && freeUsage >= 10) {
            return res.status(403).json({ message: 'Free usage limit exceeded. Upgrade to premium for more requests.' });
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 100,
        });
        
        const content = response.choices[0].message.content

        // Save to database
        await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'blog-title')`;

        // Update free usage (INCREMENT, not decrement)
        if(plan !== 'premium'){
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    freeUsage: freeUsage + 1 
                }
            });
        }
        
        res.json({success: true, content});
        
    } catch (error) {
        console.error('Error generating blog-title:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

export const generateImage = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {prompt, publish} = req.body;
        const plan = req.plan;
        const freeUsage = req.free_usage

        // Check if user has exceeded free usage
        if (plan !== 'premium' ) {
            return res.status(403).json({ message: 'This feature is only available for premium users.'});
        }
        const formData = new FormData()
        formData.append('prompt', prompt)

        const {data} = await axios.post('https://clipdrop-api.co/text-to-image/v1',formData,{
            headers: {
                'x-api-key': process.env.CLIPDROP_API_KEY,
            },
            responseType: 'arraybuffer'
        })
        const base64Image = `data:image/png;base64,${Buffer.from(data,'binary').toString('base64')}`;

        const {secure_url} = await cloudinary.uploader.upload(base64Image) 

        // Save to database
        await sql`INSERT INTO creations (user_id, prompt, content, type, publish) VALUES(${userId}, ${prompt}, ${secure_url}, 'image',${publish ?? false})`;
       
        await clerkClient.users.updateUserMetadata(userId, {
            privateMetadata: {
                freeUsage: freeUsage + 1
            }
        })
        res.json({success: true, content: secure_url});
        
    } catch (error) {
        console.error('Error generating image:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
export const removeImageBackground = async (req, res) => {
    try {
        const { userId } = req.auth();
        const plan = req.plan;
        const freeUsage = req.free_usage;
        const image = req.file;

        // Validate required data
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User authentication required"
            });
        }

        if (!image) {
            return res.status(400).json({
                success: false,
                message: "No image file provided"
            });
        }

        // Check plan restrictions (commented out for testing - uncomment when ready)
        // if (plan !== "premium") {
        //     return res.status(403).json({
        //         success: false,
        //         message: "This feature is only available for premium users."
        //     });
        // }

        console.log('Processing image:', image.originalname);
        console.log('Image path:', image.path);

        // Upload to Cloudinary with background removal
        const uploadResult = await cloudinary.uploader.upload(image.path, {
            transformation: [
                {
                    effect: 'background_removal'
                }
            ],
            resource_type: 'image'
        });

        const { secure_url } = uploadResult;

        // Clean up temporary file
        if (fs.existsSync(image.path)) {
            fs.unlinkSync(image.path);
        }

        // Insert into database
        await sql`INSERT INTO creations (user_id, prompt, content, type, publish) 
                 VALUES(${userId}, 'Remove background from image', ${secure_url}, 'image', false)`;

        // Update user usage
        try {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: { freeUsage: freeUsage + 1 },
            });
        } catch (clerkError) {
            console.error('Error updating user metadata:', clerkError);
            // Continue execution even if metadata update fails
        }

        // Return success response
        res.json({
            success: true,
            content: secure_url,
            message: 'Background removed successfully'
        });

    } catch (error) {
        console.error('Error removing background:', error);
        
        // Clean up temporary file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: error.message
        });
    }
};

export const reviewResume = async (req, res) => {
    console.log('=== RESUME REVIEW FUNCTION CALLED ===');
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('File info:', req.file ? {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path
    } : 'No file found');
    
    // Early return with debug info if this is the wrong endpoint
    if (!req.file) {
        console.log('ERROR: No file found in request');
        return res.status(400).json({ 
            success: false, 
            message: "No resume file provided",
            debug: {
                method: req.method,
                url: req.url,
                hasFile: !!req.file,
                headers: req.headers
            }
        });
    }
    
    try {
        // Check if auth middleware worked
        let userId, plan, freeUsage;
        try {
            const authResult = req.auth();
            userId = authResult?.userId;
            plan = req.plan;
            freeUsage = req.free_usage;
            console.log('Auth info:', { userId, plan, freeUsage });
        } catch (authError) {
            console.log('Auth error:', authError);
            return res.status(401).json({ 
                success: false, 
                message: "User authentication failed",
                error: authError.message 
            });
        }

        // Validate required fields
        if (!userId) {
            console.log('Missing userId after auth');
            return res.status(401).json({ 
                success: false, 
                message: "User authentication required" 
            });
        }

        const resume = req.file;

        // Check usage limits (same pattern as article generator)
        if (plan !== 'premium' && freeUsage >= 10) {
            console.log('Usage limit exceeded:', { plan, freeUsage });
            return res.status(403).json({ 
                success: false,
                message: 'Free usage limit exceeded. Upgrade to premium for more requests.' 
            });
        }

        // Check file size (5MB limit)
        if (resume.size > 5 * 1024 * 1024) {
            console.log('File too large:', resume.size);
            return res.status(400).json({ 
                success: false, 
                message: "Resume file size exceeds 5MB limit." 
            });
        }

        // Check file format
        const allowedMimeTypes = ['application/pdf'];
        if (!allowedMimeTypes.includes(resume.mimetype)) {
            console.log('Invalid file type:', resume.mimetype);
            return res.status(400).json({ 
                success: false, 
                message: "Only PDF files are supported." 
            });
        }

        // Check if file exists
        if (!fs.existsSync(resume.path)) {
            console.log('File does not exist at path:', resume.path);
            return res.status(400).json({ 
                success: false, 
                message: "Resume file not found" 
            });
        }

        let extractedText = '';

        try {
            console.log('Starting PDF extraction...');
            const dataBuffer = fs.readFileSync(resume.path);
            console.log('File read successfully, buffer size:', dataBuffer.length);
            
            const pdfData = await pdf(dataBuffer);
            extractedText = pdfData.text;

            console.log('PDF extraction completed, text length:', extractedText.length);
            console.log('First 200 characters:', extractedText.substring(0, 200));

            // Validate extracted text
            if (!extractedText || extractedText.trim().length === 0) {
                console.log('No text extracted from PDF');
                return res.status(400).json({ 
                    success: false, 
                    message: "Could not extract text from PDF. Please ensure the file contains readable text and is not image-only." 
                });
            }

            // Limit text length to avoid token limits
            if (extractedText.length > 8000) {
                extractedText = extractedText.substring(0, 8000) + "\n\n[Content truncated for analysis]";
                console.log('Text truncated to 8000 characters');
            }

            console.log(`Successfully extracted ${extractedText.length} characters from PDF`);

        } catch (pdfError) {
            console.error("PDF extraction error:", pdfError);
            return res.status(400).json({ 
                success: false, 
                message: "Failed to read PDF content. Please ensure the file is a valid, readable PDF.",
                error: process.env.NODE_ENV === 'development' ? pdfError.message : undefined
            });
        }

        // Create comprehensive prompt for resume analysis
        const prompt = `As an expert resume reviewer, analyze this resume and provide detailed feedback:

RESUME CONTENT:
${extractedText}

Provide analysis covering:
1. OVERALL ASSESSMENT - strengths, weaknesses, marketability
2. CONTENT QUALITY - experience descriptions, skills, achievements
3. STRUCTURE & FORMAT - layout, organization, readability
4. RECOMMENDATIONS - specific improvements to make
5. ATS OPTIMIZATION - keyword suggestions for applicant tracking systems
6. MISSING ELEMENTS - important sections to add

Give constructive, actionable advice to improve interview chances.`;

        console.log('Calling Gemini AI for resume analysis...');
        console.log('Prompt length:', prompt.length);

        // Use same API call pattern as your working article generator
        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash", // Same model as your article generator
            messages: [
                {
                    role: "system",
                    content: "You are an expert resume reviewer and career counselor. Provide detailed, actionable feedback to help job seekers improve their resumes."
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 1500,
        });

        console.log('AI response received:', response);
        
        const content = response.choices[0].message.content;
        
        if (!content || content.trim().length === 0) {
            console.log('AI returned empty content');
            throw new Error('AI service returned empty response');
        }

        console.log('AI analysis completed successfully, content length:', content.length);

        try {
            // Save to database (same pattern as article generator)
            await sql`INSERT INTO creations (user_id, prompt, content, type, publish) VALUES(${userId}, ${prompt}, ${content}, 'resume-review', false)`;
            console.log('Saved to database successfully');
        } catch (dbError) {
            console.error('Database save error:', dbError);
            // Continue - don't fail the request
        }

        try {
            // Update free usage (same pattern as article generator)
            if (plan !== 'premium') {
                await clerkClient.users.updateUserMetadata(userId, {
                    privateMetadata: {
                        freeUsage: freeUsage + 1 // INCREMENT by 1
                    }
                });
                console.log('Updated user usage successfully');
            }
        } catch (usageError) {
            console.error('Usage update error:', usageError);
            // Continue - don't fail the request
        }

        // Clean up temporary file
        try {
            if (fs.existsSync(resume.path)) {
                fs.unlinkSync(resume.path);
                console.log('Temporary file cleaned up');
            }
        } catch (cleanupError) {
            console.warn("Could not clean up temporary file:", cleanupError);
        }

        console.log('Sending success response');
        console.log('Response content preview:', content.substring(0, 200) + '...');
        
        // Return success response (same pattern as article generator)
        return res.json({ 
            success: true, 
            content: content,
            message: "Resume analyzed successfully"
        });

    } catch (error) {
        console.error('=== ERROR IN RESUME REVIEW ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Clean up file on error
        try {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
                console.log('Cleaned up file on error');
            }
        } catch (cleanupError) {
            console.warn("Could not clean up file on error:", cleanupError);
        }
        
        // Same error response pattern as article generator
        return res.status(500).json({ 
            success: false,
            message: 'Internal Server Error', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};