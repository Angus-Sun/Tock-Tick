// Utility functions for user management

/**
 * Generates a default username in the format "user" + 6 random digits
 * @returns {string} A username like "user123456"
 */
export function generateDefaultUsername() {
  const randomNumber = Math.floor(100000 + Math.random() * 900000); // Generates 6-digit number
  return `user${randomNumber}`;
}

/**
 * Creates a profile for a new user with default username
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - The user's ID from auth
 * @param {number} maxRetries - Maximum number of retries for unique username generation
 * @returns {Promise<Object>} The created profile data or error
 */
export async function createDefaultProfile(supabase, userId, maxRetries = 5) {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      const defaultUsername = generateDefaultUsername();
      
      const { data, error } = await supabase
        .from('profiles')
        .insert([
          {
            id: userId,
            username: defaultUsername,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) {
        // If username already exists, try again with a new random number
        if (error.code === '23505' && error.details?.includes('username')) {
          attempts++;
          continue;
        }
        throw error;
      }

      return { data, error: null };
    } catch (err) {
      if (attempts >= maxRetries - 1) {
        return { data: null, error: err };
      }
      attempts++;
    }
  }
  
  return { 
    data: null, 
    error: new Error('Failed to generate unique username after maximum retries') 
  };
}