import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

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
  // start as undefined so consumers can differentiate "not loaded yet" vs "no user"
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Auth state listener
  useEffect(() => {
    // get current user once on mount
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
    }).catch(() => setUser(null));

    // subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      try {
        subscription.unsubscribe();
      } catch (e) {
        // noop
      }
    };
  }, []);

  const fetchProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    try {
      // select only expected columns to avoid content-negotiation issues
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id,username,avatar_url')
        .eq('id', user.id)
        .single();
      if (error) {
        console.warn('fetchProfile warning', status, error);
        setProfile(null);
      } else {
        setProfile(data || null);
      }
    } catch (err) {
      console.error('fetchProfile failed', err);
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Fetch profile when we have a resolved user (skip while initial auth state is loading)
  useEffect(() => {
    if (user === undefined) return;
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
