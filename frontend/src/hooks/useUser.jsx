import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { createDefaultProfile } from '../utils/userUtils';

// Shape:
// user: Supabase auth user object or null
// profile: row from profiles table or null
// setProfile: updater for local profile state after edits
// refreshProfile: refetch from DB

const UserContext = createContext({
  user: null,
  profile: null,
  setProfile: () => {},
  refreshProfile: async () => {}
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Auth state listener
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.user || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist, create a default one
      const { data: newProfile, error: createError } = await createDefaultProfile(supabase, user.id);
      if (!createError && newProfile) {
        setProfile(newProfile);
      } else {
        console.error("Failed to create default profile:", createError);
      }
    } else if (!error) {
      setProfile(data);
    }
    
    setLoadingProfile(false);
  };

  // Fetch profile on user change
  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const value = {
    user,
    profile,
    setProfile,
    refreshProfile: fetchProfile,
    loadingProfile
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}

export default useUser;
