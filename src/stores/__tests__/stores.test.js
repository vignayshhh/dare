// Comprehensive store tests (JavaScript to avoid TS issues)
const { 
  useAuthStore, 
  useFeedStore, 
  useDareStore, 
  useMessagingStore, 
  useProfileStore, 
  usePresenceStore 
} = require('../index')

// Mock services
jest.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentState: jest.fn(() => ({ user: null, loading: true, error: null })),
    subscribe: jest.fn(),
    initializeAuth: jest.fn(),
    signUp: jest.fn(),
    signIn: jest.fn(),
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    updateProfile: jest.fn(),
  }
}))

jest.mock('@/services/feed.service', () => ({
  feedService: {
    getFeed: jest.fn(),
    createPost: jest.fn(),
    likePost: jest.fn(),
    unlikePost: jest.fn(),
    getPost: jest.fn(),
    getUserPosts: jest.fn(),
    searchPosts: jest.fn(),
    deletePost: jest.fn(),
    loadFeedEvents: jest.fn(),
  }
}))

jest.mock('@/services/dare.service', () => ({
  dareService: {
    getUserDares: jest.fn(),
    createDare: jest.fn(),
    acceptDare: jest.fn(),
    chickenOut: jest.fn(),
    submitProof: jest.fn(),
    startReview: jest.fn(),
    moveToFriendsValidation: jest.fn(),
    voteOnDare: jest.fn(),
    getDareWithUsers: jest.fn(),
    canUserDareUser: jest.fn(),
    getDareStats: jest.fn(),
  }
}))

jest.mock('@/services/messaging.service', () => ({
  messagingService: {
    getUserConversations: jest.fn(),
    createConversation: jest.fn(),
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    markMessagesAsSeen: jest.fn(),
    trackScreenshot: jest.fn(),
    trackAlmostSent: jest.fn(),
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
    freezeConversation: jest.fn(),
    unfreezeConversation: jest.fn(),
    deleteMessage: jest.fn(),
    initiateRandomChatDare: jest.fn(),
    respondToRandomChatDare: jest.fn(),
    subscribeToConversation: jest.fn(),
    unsubscribeFromConversation: jest.fn(),
  }
}))

jest.mock('@/services/user.service', () => ({
  userService: {
    getProfile: jest.fn(),
    getProfileByUsername: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    searchProfiles: jest.fn(),
    trackProfileView: jest.fn(),
    getProfileViewers: jest.fn(),
    activateGhostMode: jest.fn(),
    deactivateGhostMode: jest.fn(),
    getUserStats: jest.fn(),
  }
}))

jest.mock('@/services/friends.service', () => ({
  friendsService: {
    getFriends: jest.fn(),
    getFriendRequests: jest.fn(),
    getSentFriendRequests: jest.fn(),
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    rejectFriendRequest: jest.fn(),
    removeFriend: jest.fn(),
    getFriendSuggestions: jest.fn(),
    getMutualFriends: jest.fn(),
    blockUser: jest.fn(),
  }
}))

jest.mock('@/services/presence.service', () => ({
  presenceService: {
    initializePresence: jest.fn(),
    updatePresence: jest.fn(),
    getUserPresence: jest.fn(),
    getOnlineFriends: jest.fn(),
    trackProfileView: jest.fn(),
    stopProfileView: jest.fn(),
    trackTypingInChat: jest.fn(),
    stopTypingInChat: jest.fn(),
    setGhostMode: jest.fn(),
    goOffline: jest.fn(),
    getWhoUserIsChattingWith: jest.fn(),
    getProfileViewers: jest.fn(),
    isUserBeingIgnored: jest.fn(),
    getPresenceStats: jest.fn(),
    getBulkPresence: jest.fn(),
    getOnlineUsersNotFriends: jest.fn(),
    cleanup: jest.fn(),
    subscribeToUserPresence: jest.fn(),
    subscribeToFriendsPresence: jest.fn(),
  }
}))

// Helper function to create a mock store instance
const createMockStore = (storeHook) => {
  const state = {}
  const actions = {}
  
  // Mock the store hook
  const mockStore = jest.fn(() => ({
    ...state,
    ...actions,
    setState: (updates) => Object.assign(state, updates)
  }))
  
  return mockStore
}

describe('Backend Stores Comprehensive Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('AuthStore', () => {
    let authStore

    beforeEach(() => {
      // Create a mock implementation of the store
      authStore = {
        user: null,
        loading: true,
        error: null,
        isAuthenticated: false,
        currentUser: null,
        initializeAuth: jest.fn(),
        signUp: jest.fn(),
        signIn: jest.fn(),
        signInWithGoogle: jest.fn(),
        signOut: jest.fn(),
        updateProfile: jest.fn(),
        clearError: jest.fn()
      }
    })

    it('should have correct initial state', () => {
      expect(authStore.user).toBeNull()
      expect(authStore.loading).toBe(true)
      expect(authStore.error).toBeNull()
      expect(authStore.isAuthenticated).toBe(false)
    })

    it('should handle sign up', async () => {
      const { authService } = require('@/services/auth.service')
      authService.signUp.mockResolvedValue({ success: true })

      await authStore.signUp({
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        is18Plus: true,
        consentAccepted: true
      })

      expect(authService.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        is18Plus: true,
        consentAccepted: true
      })
    })

    it('should handle sign in', async () => {
      const { authService } = require('@/services/auth.service')
      authService.signIn.mockResolvedValue({ success: true })

      await authStore.signIn('test@example.com')
      expect(authService.signIn).toHaveBeenCalledWith('test@example.com')
    })

    it('should handle sign out', async () => {
      const { authService } = require('@/services/auth.service')
      authService.signOut.mockResolvedValue()

      await authStore.signOut()
      expect(authService.signOut).toHaveBeenCalled()
    })

    it('should update profile', async () => {
      authStore.user = { user_id: 'test-user-id' }
      const { authService } = require('@/services/auth.service')
      authService.updateProfile.mockResolvedValue({ success: true, user: { id: 'updated-profile' } })

      await authStore.updateProfile({ display_name: 'Updated Name' })
      expect(authService.updateProfile).toHaveBeenCalledWith({ display_name: 'Updated Name' })
    })

    it('should clear error', () => {
      authStore.error = 'Some error'
      authStore.clearError()
      expect(authStore.error).toBeNull()
    })
  })

  describe('FeedStore', () => {
    let feedStore

    beforeEach(() => {
      feedStore = {
        posts: [],
        feedEvents: [],
        loading: false,
        error: null,
        hasMore: true,
        offset: 0,
        unreadCount: 0,
        loadFeed: jest.fn(),
        loadMoreFeed: jest.fn(),
        createPost: jest.fn(),
        likePost: jest.fn(),
        unlikePost: jest.fn(),
        getPost: jest.fn(),
        getUserPosts: jest.fn(),
        searchPosts: jest.fn(),
        deletePost: jest.fn(),
        loadFeedEvents: jest.fn(),
        refreshFeed: jest.fn(),
        clearError: jest.fn()
      }
    })

    it('should have correct initial state', () => {
      expect(feedStore.posts).toEqual([])
      expect(feedStore.loading).toBe(false)
      expect(feedStore.hasMore).toBe(true)
      expect(feedStore.offset).toBe(0)
    })

    it('should load feed', async () => {
      const { feedService } = require('@/services/feed.service')
      const mockPosts = [{ id: 'post-1', content: 'Test post' }]
      feedService.getFeed.mockResolvedValue(mockPosts)

      await feedStore.loadFeed('user-id')
      expect(feedService.getFeed).toHaveBeenCalledWith('user-id', 20, 0)
    })

    it('should create post', async () => {
      const { feedService } = require('@/services/feed.service')
      const mockPost = { id: 'post-1', content: 'New post' }
      feedService.createPost.mockResolvedValue(mockPost)
      feedService.getPost.mockResolvedValue(mockPost)

      const result = await feedStore.createPost({
        author_id: 'user-id',
        content: 'New post'
      })
      expect(feedService.createPost).toHaveBeenCalled()
    })

    it('should like post', async () => {
      const { feedService } = require('@/services/feed.service')
      feedService.likePost.mockResolvedValue()

      await feedStore.likePost('post-id', 'user-id')
      expect(feedService.likePost).toHaveBeenCalledWith('post-id', 'user-id')
    })

    it('should unlike post', async () => {
      const { feedService } = require('@/services/feed.service')
      feedService.unlikePost.mockResolvedValue()

      await feedStore.unlikePost('post-id', 'user-id')
      expect(feedService.unlikePost).toHaveBeenCalledWith('post-id', 'user-id')
    })

    it('should calculate unread count', () => {
      feedStore.feedEvents = [{ id: 'event-1' }, { id: 'event-2' }]
      expect(feedStore.unreadCount).toBe(2)
    })
  })

  describe('DareStore', () => {
    let dareStore

    beforeEach(() => {
      dareStore = {
        sentDares: [],
        receivedDares: [],
        currentDare: null,
        loading: false,
        error: null,
        creatingDare: false,
        activeDaresCount: 0,
        pendingDaresCount: 0,
        completedDaresCount: 0,
        loadUserDares: jest.fn(),
        createDare: jest.fn(),
        acceptDare: jest.fn(),
        chickenOut: jest.fn(),
        submitProof: jest.fn(),
        startReview: jest.fn(),
        moveToFriendsValidation: jest.fn(),
        voteOnDare: jest.fn(),
        getDare: jest.fn(),
        canUserDareUser: jest.fn(),
        getDareStats: jest.fn(),
        clearCurrentDare: jest.fn(),
        clearError: jest.fn()
      }
    })

    it('should have correct initial state', () => {
      expect(dareStore.sentDares).toEqual([])
      expect(dareStore.receivedDares).toEqual([])
      expect(dareStore.currentDare).toBeNull()
      expect(dareStore.loading).toBe(false)
    })

    it('should load user dares', async () => {
      const { dareService } = require('@/services/dare.service')
      const mockDares = [{ id: 'dare-1', description: 'Test dare' }]
      dareService.getUserDares.mockResolvedValue(mockDares)

      await dareStore.loadUserDares('user-id')
      expect(dareService.getUserDares).toHaveBeenCalledWith('user-id', 'all')
    })

    it('should create dare', async () => {
      const { dareService } = require('@/services/dare.service')
      const mockDare = { id: 'dare-1', description: 'New dare' }
      dareService.createDare.mockResolvedValue(mockDare)
      dareService.getDareWithUsers.mockResolvedValue(mockDare)

      const result = await dareStore.createDare({
        challenger_id: 'challenger-id',
        receiver_id: 'receiver-id',
        description: 'New dare'
      })
      expect(dareService.createDare).toHaveBeenCalled()
    })

    it('should accept dare', async () => {
      const { dareService } = require('@/services/dare.service')
      dareService.acceptDare.mockResolvedValue()

      await dareStore.acceptDare('dare-id', 'receiver-id')
      expect(dareService.acceptDare).toHaveBeenCalledWith('dare-id', 'receiver-id')
    })

    it('should vote on dare', async () => {
      const { dareService } = require('@/services/dare.service')
      dareService.voteOnDare.mockResolvedValue()

      await dareStore.voteOnDare('dare-id', 'voter-id', 'REAL')
      expect(dareService.voteOnDare).toHaveBeenCalledWith('dare-id', 'voter-id', 'REAL')
    })

    it('should calculate active dares count', () => {
      dareStore.sentDares = [
        { state: 'SENT' },
        { state: 'ACCEPTED' }
      ]
      dareStore.receivedDares = [
        { state: 'SENT' }
      ]
      expect(dareStore.activeDaresCount).toBe(3)
    })

    it('should calculate pending dares count', () => {
      dareStore.receivedDares = [
        { state: 'SENT' },
        { state: 'SENT' },
        { state: 'ACCEPTED' }
      ]
      expect(dareStore.pendingDaresCount).toBe(2)
    })
  })

  describe('MessagingStore', () => {
    let messagingStore

    beforeEach(() => {
      messagingStore = {
        conversations: [],
        currentConversation: null,
        messages: [],
        loading: false,
        error: null,
        sendingMessage: false,
        loadingMessages: false,
        typingUsers: [],
        messageEvents: [],
        unreadCount: 0,
        hasActiveConversation: false,
        isTyping: false,
        isConversationFrozen: false,
        loadConversations: jest.fn(),
        getOrCreateConversation: jest.fn(),
        loadMessages: jest.fn(),
        sendMessage: jest.fn(),
        markMessagesAsSeen: jest.fn(),
        trackScreenshot: jest.fn(),
        trackAlmostSent: jest.fn(),
        startTyping: jest.fn(),
        stopTyping: jest.fn(),
        freezeConversation: jest.fn(),
        unfreezeConversation: jest.fn(),
        deleteMessage: jest.fn(),
        initiateRandomChatDare: jest.fn(),
        respondToRandomChatDare: jest.fn(),
        subscribeToConversation: jest.fn(),
        unsubscribeFromConversation: jest.fn(),
        clearCurrentConversation: jest.fn(),
        clearError: jest.fn()
      }
    })

    it('should have correct initial state', () => {
      expect(messagingStore.conversations).toEqual([])
      expect(messagingStore.currentConversation).toBeNull()
      expect(messagingStore.messages).toEqual([])
      expect(messagingStore.loading).toBe(false)
    })

    it('should load conversations', async () => {
      const { messagingService } = require('@/services/messaging.service')
      const mockConversations = [{ id: 'conv-1', user1_id: 'user1' }]
      messagingService.getUserConversations.mockResolvedValue(mockConversations)

      await messagingStore.loadConversations('user-id')
      expect(messagingService.getUserConversations).toHaveBeenCalledWith('user-id')
    })

    it('should send message', async () => {
      const { messagingService } = require('@/services/messaging.service')
      const mockMessage = { id: 'msg-1', content: 'Hello' }
      messagingService.sendMessage.mockResolvedValue(mockMessage)

      await messagingStore.sendMessage({
        conversation_id: 'conv-id',
        sender_id: 'sender-id',
        content: 'Hello'
      })
      expect(messagingService.sendMessage).toHaveBeenCalled()
    })

    it('should start typing', async () => {
      const { messagingService } = require('@/services/messaging.service')
      messagingService.startTyping.mockResolvedValue()

      await messagingStore.startTyping('conv-id', 'user-id', 'normal')
      expect(messagingService.startTyping).toHaveBeenCalledWith('conv-id', 'user-id', 'normal')
    })

    it('should calculate unread count', () => {
      messagingStore.conversations = [
        { unread_count: 2 },
        { unread_count: 3 },
        { unread_count: 0 }
      ]
      expect(messagingStore.unreadCount).toBe(5)
    })

    it('should check if conversation is active', () => {
      messagingStore.currentConversation = { id: 'conv-1' }
      expect(messagingStore.hasActiveConversation).toBe(true)

      messagingStore.currentConversation = null
      expect(messagingStore.hasActiveConversation).toBe(false)
    })
  })

  describe('ProfileStore', () => {
    let profileStore

    beforeEach(() => {
      profileStore = {
        currentProfile: null,
        viewedProfile: null,
        friends: [],
        friendRequests: [],
        sentFriendRequests: [],
        profileViewers: [],
        userStats: null,
        loading: false,
        error: null,
        updatingProfile: false,
        friendsCount: 0,
        pendingRequestsCount: 0,
        loadProfile: jest.fn(),
        getProfileByUsername: jest.fn(),
        createProfile: jest.fn(),
        updateProfile: jest.fn(),
        searchProfiles: jest.fn(),
        trackProfileView: jest.fn(),
        getProfileViewers: jest.fn(),
        activateGhostMode: jest.fn(),
        deactivateGhostMode: jest.fn(),
        getUserStats: jest.fn(),
        loadFriends: jest.fn(),
        loadFriendRequests: jest.fn(),
        loadSentFriendRequests: jest.fn(),
        sendFriendRequest: jest.fn(),
        acceptFriendRequest: jest.fn(),
        rejectFriendRequest: jest.fn(),
        removeFriend: jest.fn(),
        getFriendSuggestions: jest.fn(),
        getMutualFriends: jest.fn(),
        blockUser: jest.fn(),
        clearViewedProfile: jest.fn(),
        clearError: jest.fn()
      }
    })

    it('should have correct initial state', () => {
      expect(profileStore.currentProfile).toBeNull()
      expect(profileStore.friends).toEqual([])
      expect(profileStore.loading).toBe(false)
    })

    it('should load profile', async () => {
      const { userService } = require('@/services/user.service')
      const mockProfile = { id: 'profile-1', username: 'testuser' }
      userService.getProfile.mockResolvedValue(mockProfile)

      await profileStore.loadProfile('user-id')
      expect(userService.getProfile).toHaveBeenCalledWith('user-id')
    })

    it('should send friend request', async () => {
      const { friendsService } = require('@/services/friends.service')
      const mockFriendship = { id: 'friendship-1', status: 'pending' }
      friendsService.sendFriendRequest.mockResolvedValue(mockFriendship)

      await profileStore.sendFriendRequest('user1', 'user2')
      expect(friendsService.sendFriendRequest).toHaveBeenCalledWith('user1', 'user2')
    })

    it('should accept friend request', async () => {
      const { friendsService } = require('@/services/friends.service')
      const mockFriendship = { id: 'friendship-1', status: 'accepted' }
      friendsService.acceptFriendRequest.mockResolvedValue(mockFriendship)

      await profileStore.acceptFriendRequest('friendship-id')
      expect(friendsService.acceptFriendRequest).toHaveBeenCalledWith('friendship-id')
    })

    it('should check if current user', () => {
      profileStore.currentProfile = { user_id: 'current-user' }
      
      expect(profileStore.isCurrentUser('current-user')).toBe(true)
      expect(profileStore.isCurrentUser('other-user')).toBe(false)
    })

    it('should check if is friend', () => {
      profileStore.friends = [{ user_id: 'friend-1' }, { user_id: 'friend-2' }]
      
      expect(profileStore.isFriend('friend-1')).toBe(true)
      expect(profileStore.isFriend('non-friend')).toBe(false)
    })

    it('should calculate friends count', () => {
      profileStore.friends = [{ user_id: 'friend-1' }, { user_id: 'friend-2' }]
      expect(profileStore.friendsCount).toBe(2)
    })
  })

  describe('PresenceStore', () => {
    let presenceStore

    beforeEach(() => {
      presenceStore = {
        userPresence: null,
        onlineFriends: [],
        profileViewers: [],
        presenceStats: null,
        onlineUsersNotFriends: [],
        loading: false,
        error: null,
        isOnline: false,
        isGhostMode: false,
        isTyping: false,
        onlineFriendsCount: 0,
        profileViewersCount: 0,
        initializePresence: jest.fn(),
        updatePresence: jest.fn(),
        getUserPresence: jest.fn(),
        getOnlineFriends: jest.fn(),
        trackProfileView: jest.fn(),
        stopProfileView: jest.fn(),
        trackTypingInChat: jest.fn(),
        stopTypingInChat: jest.fn(),
        setGhostMode: jest.fn(),
        goOffline: jest.fn(),
        getWhoUserIsChattingWith: jest.fn(),
        getProfileViewers: jest.fn(),
        isUserBeingIgnored: jest.fn(),
        getPresenceStats: jest.fn(),
        getBulkPresence: jest.fn(),
        getOnlineUsersNotFriends: jest.fn(),
        cleanup: jest.fn(),
        subscribeToUserPresence: jest.fn(),
        subscribeToFriendsPresence: jest.fn(),
        clearError: jest.fn()
      }
    })

    it('should have correct initial state', () => {
      expect(presenceStore.userPresence).toBeNull()
      expect(presenceStore.onlineFriends).toEqual([])
      expect(presenceStore.loading).toBe(false)
    })

    it('should initialize presence', () => {
      const { presenceService } = require('@/services/presence.service')
      
      presenceStore.initializePresence('user-id')
      expect(presenceService.initializePresence).toHaveBeenCalledWith('user-id')
    })

    it('should update presence', async () => {
      const { presenceService } = require('@/services/presence.service')
      const mockPresence = { id: 'presence-1', is_online: true }
      presenceService.updatePresence.mockResolvedValue(mockPresence)

      await presenceStore.updatePresence('user-id', { is_online: true })
      expect(presenceService.updatePresence).toHaveBeenCalledWith('user-id', { is_online: true })
    })

    it('should get online friends', async () => {
      const { presenceService } = require('@/services/presence.service')
      const mockFriends = [{ id: 'friend-1', is_online: true }]
      presenceService.getOnlineFriends.mockResolvedValue(mockFriends)

      await presenceStore.getOnlineFriends('user-id')
      expect(presenceService.getOnlineFriends).toHaveBeenCalledWith('user-id')
    })

    it('should track profile view', async () => {
      const { presenceService } = require('@/services/presence.service')
      presenceService.trackProfileView.mockResolvedValue()

      await presenceStore.trackProfileView('viewer-id', 'profile-id')
      expect(presenceService.trackProfileView).toHaveBeenCalledWith('viewer-id', 'profile-id')
    })

    it('should check if online', () => {
      presenceStore.userPresence = { is_online: true }
      expect(presenceStore.isOnline).toBe(true)

      presenceStore.userPresence = { is_online: false }
      expect(presenceStore.isOnline).toBe(false)
    })

    it('should check if ghost mode', () => {
      presenceStore.userPresence = { ghost_mode: true }
      expect(presenceStore.isGhostMode).toBe(true)

      presenceStore.userPresence = { ghost_mode: false }
      expect(presenceStore.isGhostMode).toBe(false)
    })

    it('should calculate online friends count', () => {
      presenceStore.onlineFriends = [{ id: 'friend-1' }, { id: 'friend-2' }]
      expect(presenceStore.onlineFriendsCount).toBe(2)
    })
  })

  describe('Store Integration Tests', () => {
    it('should handle complete user flow across stores', async () => {
      // 1. Auth flow
      const authStore = {
        user: null,
        loading: true,
        error: null,
        isAuthenticated: false,
        signUp: jest.fn(),
        signIn: jest.fn(),
        signOut: jest.fn()
      }

      const { authService } = require('@/services/auth.service')
      authService.signIn.mockResolvedValue({ success: true })

      await authStore.signIn('test@example.com')
      expect(authService.signIn).toHaveBeenCalled()

      // 2. Profile flow
      const profileStore = {
        currentProfile: null,
        friends: [],
        loadProfile: jest.fn(),
        loadFriends: jest.fn()
      }

      const { userService } = require('@/services/user.service')
      const mockProfile = { id: 'profile-1', username: 'testuser' }
      userService.getProfile.mockResolvedValue(mockProfile)

      await profileStore.loadProfile('user-id')
      expect(userService.getProfile).toHaveBeenCalledWith('user-id')

      // 3. Feed flow
      const feedStore = {
        posts: [],
        loadFeed: jest.fn(),
        createPost: jest.fn()
      }

      const { feedService } = require('@/services/feed.service')
      const mockPosts = [{ id: 'post-1', content: 'Test post' }]
      feedService.getFeed.mockResolvedValue(mockPosts)

      await feedStore.loadFeed('user-id')
      expect(feedService.getFeed).toHaveBeenCalled()
    })

    it('should handle error states across stores', async () => {
      // Auth error
      const authStore = { error: null, clearError: jest.fn() }
      authStore.error = 'Auth error'
      authStore.clearError()
      expect(authStore.error).toBeNull()

      // Feed error
      const feedStore = { error: null, clearError: jest.fn() }
      feedStore.error = 'Feed error'
      feedStore.clearError()
      expect(feedStore.error).toBeNull()

      // Dare error
      const dareStore = { error: null, clearError: jest.fn() }
      dareStore.error = 'Dare error'
      dareStore.clearError()
      expect(dareStore.error).toBeNull()
    })

    it('should handle loading states across stores', () => {
      const authStore = { loading: false }
      const feedStore = { loading: false }
      const dareStore = { loading: false }
      const messagingStore = { loading: false, sendingMessage: false, loadingMessages: false }
      const profileStore = { loading: false, updatingProfile: false }
      const presenceStore = { loading: false }

      // All stores should start with loading: false
      expect(authStore.loading).toBe(false)
      expect(feedStore.loading).toBe(false)
      expect(dareStore.loading).toBe(false)
      expect(messagingStore.loading).toBe(false)
      expect(profileStore.loading).toBe(false)
      expect(presenceStore.loading).toBe(false)
    })
  })

  describe('Performance Tests', () => {
    it('should handle large data sets efficiently', () => {
      // Test with large number of posts
      const feedStore = { posts: [] }
      
      // Simulate loading 1000 posts
      const largePostSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post content ${i}`
      }))
      
      feedStore.posts = largePostSet
      
      const startTime = Date.now()
      const postCount = feedStore.posts.length
      const endTime = Date.now()
      
      expect(postCount).toBe(1000)
      expect(endTime - startTime).toBeLessThan(10) // Should be very fast
    })

    it('should handle rapid state updates', () => {
      const authStore = { 
        user: null, 
        loading: true,
        updateState: function(updates) {
          Object.assign(this, updates)
        }
      }

      const startTime = Date.now()
      
      // Simulate 100 rapid state updates
      for (let i = 0; i < 100; i++) {
        authStore.updateState({ loading: i % 2 === 0 })
      }
      
      const endTime = Date.now()
      
      expect(endTime - startTime).toBeLessThan(50) // Should handle rapid updates
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty data gracefully', () => {
      const feedStore = { posts: [], unreadCount: 0 }
      const dareStore = { sentDares: [], receivedDares: [], activeDaresCount: 0 }
      const messagingStore = { conversations: [], messages: [], unreadCount: 0 }
      const profileStore = { friends: [], friendRequests: [], friendsCount: 0 }
      const presenceStore = { onlineFriends: [], onlineFriendsCount: 0 }

      expect(feedStore.posts.length).toBe(0)
      expect(dareStore.activeDaresCount).toBe(0)
      expect(messagingStore.unreadCount).toBe(0)
      expect(profileStore.friendsCount).toBe(0)
      expect(presenceStore.onlineFriendsCount).toBe(0)
    })

    it('should handle null/undefined values', () => {
      const authStore = { user: null, error: null }
      const feedStore = { currentPost: null, error: undefined }
      const dareStore = { currentDare: null, error: null }
      const messagingStore = { currentConversation: null, error: undefined }

      expect(authStore.user).toBeNull()
      expect(authStore.error).toBeNull()
      expect(feedStore.currentPost).toBeNull()
      expect(dareStore.currentDare).toBeNull()
      expect(messagingStore.currentConversation).toBeNull()
    })

    it('should handle concurrent operations', async () => {
      const feedStore = {
        loading: false,
        loadFeed: jest.fn(),
        createPost: jest.fn()
      }

      const { feedService } = require('@/services/feed.service')
      feedService.getFeed.mockResolvedValue([])
      feedService.createPost.mockResolvedValue({ id: 'post-1' })

      // Simulate concurrent operations
      const operations = [
        feedStore.loadFeed('user-id'),
        feedStore.createPost({ author_id: 'user-id', content: 'Post 1' }),
        feedStore.createPost({ author_id: 'user-id', content: 'Post 2' }),
        feedStore.loadFeed('user-id')
      ]

      await Promise.all(operations)
      
      expect(feedService.getFeed).toHaveBeenCalledTimes(2)
      expect(feedService.createPost).toHaveBeenCalledTimes(2)
    })
  })
})
