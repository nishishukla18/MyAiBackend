import sql from "../configs/db.js";

export const getUserCreations = async(req,res)=>{
    try {
        const { userId } = req.auth();
        const creations = await sql `SELECT *FROM creations WHERE user_id = ${userId} ORDER BY created_at DESC`
        res.json({success: true, creations});
    } catch (error) {
        console.error('Error fetching user creations:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
        
    }
}
export const getPublishedCreations = async(req,res)=>{
    try {
        const creations = await sql `SELECT *FROM creations WHERE publish = true ORDER BY created_at DESC`
        res.json({success: true, creations});
    } catch (error) {
        console.error('Error fetching user creations:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
        
    }
}
export const toggleLikeCreations = async(req,res)=>{
    try {
        const { userId } = req.auth();
        const {id} = req.body;

        const [creation] = await sql `SELECT * FROM creations WHERE id = ${id}`
        if (!creation) {
            return res.status(404).json({ message: 'Creation not found' });
        }
        const currLikes = creation.likes || 0;
        const userIdStr = userId.toString();
        let updatedLikes;
        let message;

        if(currLikes.includes(userIdStr)){
            updatedLikes = currLikes.filter((user) => user !== userIdStr);
            message = 'Like removed successfully';
        }else{
            updatedLikes = [...currLikes, userIdStr];
            message = 'Liked successfully';
        }

        const formattedArray = `{${updatedLikes.join(', ')}}`;

        await sql`UPDATE creations SET likes = ${formattedArray}::text[] WHERE id = ${id}`;
        res.json({success: true, message});
    } catch (error) {
        console.error('Error fetching user creations:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
        
    }
}