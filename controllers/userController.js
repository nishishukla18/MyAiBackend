import sql from "../configs/db.js";

export const getUserCreations = async (req, res) => {
    try {
        const { userId } = req.auth();
        
        // Fixed: Added space after SELECT *
        const creations = await sql`SELECT * FROM creations WHERE user_id = ${userId} ORDER BY created_at DESC`;
        
        res.json({ success: true, creations });
    } catch (error) {
        console.error('Error fetching user creations:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error', 
            error: error.message 
        });
    }
};

export const getPublishedCreations = async (req, res) => {
    try {
        // Fixed: Added space after SELECT *
        const creations = await sql`SELECT * FROM creations WHERE publish = true ORDER BY created_at DESC`;
        
        res.json({ success: true, creations });
    } catch (error) {
        console.error('Error fetching published creations:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error', 
            error: error.message 
        });
    }
};

export const toggleLikeCreations = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { id } = req.body;

        // Validate input
        if (!id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Creation ID is required' 
            });
        }

        const [creation] = await sql`SELECT * FROM creations WHERE id = ${id}`;
        
        if (!creation) {
            return res.status(404).json({ 
                success: false, 
                message: 'Creation not found' 
            });
        }

        // Fixed: Handle likes as array, not number
        const currLikes = creation.likes || [];
        const userIdStr = userId.toString();
        let updatedLikes;
        let message;

        // Fixed: Check if user already liked
        if (currLikes.includes(userIdStr)) {
            updatedLikes = currLikes.filter((user) => user !== userIdStr);
            message = 'Like removed successfully';
        } else {
            updatedLikes = [...currLikes, userIdStr];
            message = 'Liked successfully';
        }

        // Fixed: Let postgres-js handle array formatting
        await sql`UPDATE creations SET likes = ${updatedLikes} WHERE id = ${id}`;
        
        // Return updated creation data
        const [updatedCreation] = await sql`SELECT * FROM creations WHERE id = ${id}`;
        
        res.json({ 
            success: true, 
            message, 
            creation: updatedCreation 
        });
    } catch (error) {
        console.error('Error toggling like:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error', 
            error: error.message 
        });
    }
};