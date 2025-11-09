// Test file for username generation - can be run in browser console

import { generateDefaultUsername } from './userUtils.js';

// Test the username generation function
export function testUsernameGeneration() {
  console.log('Testing username generation...');
  
  // Generate 10 usernames to test
  const usernames = [];
  for (let i = 0; i < 10; i++) {
    const username = generateDefaultUsername();
    usernames.push(username);
    console.log(`Generated username ${i + 1}: ${username}`);
  }
  
  // Check that all usernames follow the correct format
  const validFormat = usernames.every(username => {
    const regex = /^user\d{6}$/;
    return regex.test(username);
  });
  
  console.log(`All usernames follow correct format: ${validFormat}`);
  
  // Check that all usernames are unique (very likely with 6-digit numbers)
  const uniqueUsernames = new Set(usernames);
  const allUnique = uniqueUsernames.size === usernames.length;
  
  console.log(`All generated usernames are unique: ${allUnique}`);
  
  return { usernames, validFormat, allUnique };
}

// Uncomment to run tests
// testUsernameGeneration();