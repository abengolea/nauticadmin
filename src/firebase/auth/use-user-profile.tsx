'use client';

import { useUser } from './use-user';
import { useDoc } from '../firestore/use-doc';
import type { PlatformUser, SchoolUser, UserProfile, SchoolMembership } from '@/lib/types';
import { useMemo } from 'react';

// This hardcoded ID is problematic for a multi-school app, especially for super admins.
// A better approach would be to manage the "active" or "selected" school in the UI state.
const ACTIVE_SCHOOL_ID = 'escuela-123-sn';

/**
 * A hook to get the complete profile for the current user, including global
 * and school-specific roles.
 */
export function useUserProfile() {
  const { user, loading: authLoading } = useUser();
  
  // Fetch global platform roles (e.g., isSuperAdmin)
  const { data: platformUser, loading: platformUserLoading } = useDoc<PlatformUser>(
    user ? `platformUsers/${user.uid}` : ''
  );
  
  // Determine if we have enough info to identify a super admin
  const isPotentiallySuperAdmin = !platformUserLoading && (platformUser?.super_admin ?? false);
  
  // Fetch school-specific role, but ONLY if we know the user is NOT a super admin.
  // A super admin's primary role is global, and they don't need a school document to be considered "ready".
  const { data: schoolUser, loading: schoolUserLoading } = useDoc<SchoolUser>(
    user && !isPotentiallySuperAdmin ? `schools/${ACTIVE_SCHOOL_ID}/users/${user.uid}` : ''
  );

  // The overall loading state depends on the user type.
  // For a super admin, we only need to wait for auth and platform user data.
  // For others, we also wait for the school user data.
  const loading = authLoading || platformUserLoading || (!isPotentiallySuperAdmin && schoolUserLoading);

  const profile: UserProfile | null = useMemo(() => {
    if (loading || !user) {
      return null;
    }

    const isSuperAdmin = platformUser?.super_admin ?? false;

    // Handle super admin case first. Their profile is global and not dependent on a school membership.
    if (isSuperAdmin) {
      return {
        uid: user.uid,
        displayName: user.displayName || user.email || 'Super Admin',
        email: user.email!,
        role: 'school_admin', // A super admin has the highest effective role.
        assignedCategories: [], // Not applicable at a global level.
        isSuperAdmin: true,
        activeSchoolId: undefined, // Super admin doesn't have a single "active" school.
        memberships: [], // We don't load all memberships here for performance.
      };
    }

    // If not a super admin, they MUST be a school user to have a profile.
    if (!schoolUser) {
      return null;
    }

    const membership: SchoolMembership = {
        schoolId: ACTIVE_SCHOOL_ID,
        role: schoolUser.role,
    };

    return {
      ...schoolUser,
      uid: user.uid,
      isSuperAdmin: false,
      activeSchoolId: ACTIVE_SCHOOL_ID,
      memberships: [membership],
    };
  }, [loading, user, platformUser, schoolUser]);


  const isReady = !loading;

  return {
    user,
    profile,
    loading,
    isReady,
    activeSchoolId: profile?.activeSchoolId,
    isAdmin: profile?.isSuperAdmin || profile?.role === 'school_admin',
    isCoach: profile?.role === 'coach',
    isSuperAdmin: profile?.isSuperAdmin ?? false,
  };
}
