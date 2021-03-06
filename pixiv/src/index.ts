import * as qs from 'querystring'
import * as Events from 'events'
import * as https from 'https'
import { URL } from 'url'
import { Hosts } from './hosts'

const BASE_URL = 'https://app-api.pixiv.net'
const CLIENT_ID = 'KzEZED7aC0vird8jWyHM38mXjNTY'
const CLIENT_SECRET = 'W9JZoJe00qPvJsiyCGT3CCtC6ZUtdpKpzMbNlUGP'
const CONTENT_TYPE = 'application/x-www-form-urlencoded'

function catcher(error) {
  if (error.response) {
    throw error.response.data
  } else {
    throw error.message
  }
}

interface StringMap<V> { [key: string]: V }
type StringRecursive = string | { [key: string]: StringRecursive }
type TypeMap<T extends StringMap<new (...args: any[]) => any>> = {
  [P in keyof T]: InstanceType<T[P]>
}

function toKebab(source: StringRecursive): StringRecursive {
  if (typeof source === 'string') {
    return source.replace(/-/g, '_')
      .replace(/[A-Z]/g, char => '_' + char.toLowerCase())
  } else {
    const result: StringRecursive = {}
    for (const key in source) {
      result[toKebab(key) as string] = toKebab(source[key])
    }
    return result
  }
}

interface NativeConfig {
  username?: string
  password?: string
  state?: UserState
  user?: PixivUser
  auth: UserAuth
  timeout: number
  hosts: Hosts
  events: Events
  headers: StringMap<string>
}

const _config: NativeConfig = {
  auth: null,
  timeout: 20000,
  hosts: new Hosts(),
  events: new Events(),
  headers: {
    'App-OS': 'ios',
    'App-OS-Version': '9.3.3',
    'App-Version': '7.1.11',
    'Accept-Language': 'en-US',
    'User-Agent': 'PixivIOSApp/7.1.11 (iOS 9.0; iPhone8,2)',
  },
}

interface PixivConfig {
  hosts: Hosts
  timeout: number
  language: string
}

export const config: PixivConfig = Object.defineProperties({}, {
  hosts: {
    get() {
      return _config.hosts
    }
  },
  language: {
    get() {
      return _config.headers['Accept-Language']
    },
    set(value) {
      _config.headers['Accept-Language'] = value
    }
  },
  timeout: {
    get() {
      return _config.timeout
    },
    set(value) {
      _config.timeout = value
    }
  }
})

interface RequestOptions {
  url?: string | URL
  method?: 'POST' | 'GET'
  headers?: StringMap<string>
  body?: any
}

function request(options: RequestOptions): Promise<any> {
  const url = options.url instanceof URL ? options.url : new URL(options.url, BASE_URL)
  return new Promise((resolve, reject) => {
    let data = ''
    const timeout = setTimeout(() => request.abort(), _config.timeout)
    const headers = Object.assign({ Host: url.hostname }, _config.headers)
    if (options.method === 'POST') headers['Content-Type'] = CONTENT_TYPE
    const request = https.request({
      method: options.method || 'GET',
      headers: Object.assign(headers, options.headers),
      hostname: _config.hosts.getHostName(url.hostname),
      servername: url.hostname,
      path: url.pathname + url.search,
    }, (response) => {
      response.on('data', chunk => data += chunk)
      response.on('end', () => {
        clearTimeout(timeout)
        try {
          return resolve(JSON.parse(data))
        } catch (err) {
          return reject(new Error(`An error is encounted in ${data}\n${err}`))
        }
      })
    })
    request.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    if (options.body instanceof Object) {
      request.write(qs.stringify(options.body))
    } else if (typeof options.body === 'string') {
      request.write(options.body)
    }
    request.end()
  }).then((result: any) => {
    if ('error' in result) {
      throw result.error
    } else {
      return result
    }
  })
}

interface User {
  id: string
  name: string
  account: string
}

interface UserAccount extends User {
  mail_address: string
  x_restrict: 0 | 1 | 2
  is_premium: boolean
  is_mail_authorized: boolean
  profile_image_urls: {
    px_16x16: string
    px_50x50: string
    px_170x170: string
  }
}

interface UserGeneral extends User {
  comment: string
  is_followed: boolean
  profile_image_urls: {
    medium: string
  }
}

interface UserAuth {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
  refresh_token: string
  user: UserAccount
}

interface UserState {
  is_mail_authorized: boolean
  has_changed_pixiv_id: boolean
  can_change_pixiv_id: boolean
}

interface UserProfile {
  gender: string
  birth: string
  birth_day: string
  birth_year: number
  region: string
  address_id: number
  country_code: string
  job: string
  job_id: number

  total_follow_users: number
  total_follower: number
  total_mypixiv_users: number
  total_illusts: number
  total_manga: number
  total_novels: number
  total_illust_bookmarks_public: number
  total_illust_series: number

  background_image_url: string | null
  twitter_account: string | null
  twitter_url: string | null
  pawoo_url: string | null
  webpage: string | null

  is_premium: boolean
  is_using_custom_profile_image: boolean
}

type RestrictTypes = 'public' | 'private'

interface UserPublicity {
  gender: RestrictTypes
  region: RestrictTypes
  birth_day: RestrictTypes
  birth_year: RestrictTypes
  job: RestrictTypes
  pawoo: boolean
}

interface UserWorkspace {
  pc: string
  monitor: string
  tool: string
  scanner: string
  tablet: string
  mouse: string
  printer: string
  desktop: string
  music: string
  desk: string
  chair: string
  comment: string
  workspace_image_url: string | null
}

interface ImageURLs {
  square_medium: string
  medium: string
  large: string
}

interface Tag {
  name: string
  added_by_uploaded_user?: boolean
}

export function account(): UserAccount | undefined {
  if (_config.auth) {
    return Object.assign({}, _config.auth.user)
  } else {
    throw new Error('Authorization required')
  }
}

export function user(): Promise<PixivUser> {
  if (_config.user) {
    return Promise.resolve(_config.user)
  } else if (_config.auth) {
    return search('user', _config.auth.user.id)
  } else {
    return Promise.reject(new Error('Authorization required'))
  }
}

interface AuthEvent { auth: UserAuth }
interface PixivEvents { auth: AuthEvent }

export function on<K extends keyof PixivEvents>(event: K, listener: (event: PixivEvents[K]) => any) {
  _config.events.on(event, listener)
}

export function once<K extends keyof PixivEvents>(event: K, listener: (event: PixivEvents[K]) => any) {
  _config.events.once(event, listener)
}

export function authorize(auth: UserAuth) {
  if (!auth) return
  _config.auth = auth
  _config.headers.Authorization = `Bearer ${auth.access_token}`
}

on('auth', ({auth}) => authorize(auth))

export function login(username, password): Promise<UserAuth> {
  if (!username) return Promise.reject(new TypeError('username required'))
  if (!password) return Promise.reject(new TypeError('password required'))
  return request({
    url: 'https://oauth.secure.pixiv.net/auth/token',
    method: 'POST',
    body: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      get_secure_url: 1,
      grant_type: 'password',
      username,
      password,
    }
  }).then((data) => {
    if (data.response) {
      _config.events.emit('auth', { auth: data.response })
      return data.response
    } else if (data.has_error) {
      throw data.errors.system
    } else {
      console.error('An unknown error was encounted.')
      throw data
    }
  }).catch(catcher)
}

export function logout(): void {
  _config.auth = null
  _config.username = null
  _config.password = null
  _config.state = null
  delete _config.headers.Authorization
}

function refreshAccessToken(): Promise<UserAuth> {
  if (!_config.auth) return Promise.reject(new Error('Authorization required'))
  return request({
    url: 'https://oauth.secure.pixiv.net/auth/token',
    method: 'POST',
    body: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      get_secure_url: 1,
      grant_type: 'refresh_token',
      refresh_token: _config.auth.refresh_token,
    }
  }).then((data) => {
    _config.events.emit('auth', { auth: data.response })
    return data.response
  }).catch(catcher)
}

export function createProvisionalAccount(nickname): Promise<any> {
  if (!nickname) return Promise.reject(new TypeError('nickname required'))
  return request({
    url: 'https://accounts.pixiv.net/api/provisional-accounts/create',
    method: 'POST',
    headers: {
      Authorization: 'Bearer WHDWCGnwWA2C8PRfQSdXJxjXp0G6ULRaRkkd6t5B6h8',
    },
    body: {
      ref: 'pixiv_ios_app_provisional_account',
      user_name: nickname,
    }
  }).then(data => data.body).catch(catcher)
}

function authRequest<T extends (arg: any) => any>(
  url: string | URL,
  options: RequestOptions = {},
  callback?: T,
): Promise<ReturnType<T>> {
  if (!url) return Promise.reject(new TypeError('Url cannot be empty'))
  if (!_config.auth) return Promise.reject(new Error('Authorization required'))
  options.url = url
  options.headers = options.headers || {}
  return request(options).then(
    callback,
    () => refreshAccessToken().then(() => request(options).then(callback))
  )
}

export function userState(): Promise<UserState> {
  if (_config.state) return Promise.resolve(_config.state)
  return authRequest('/v1/user/me/state').then((data) => {
    if ('user_state' in data) {
      return _config.state = data.user_state
    } else {
      throw data
    }
  })
}

interface EditOptions {
  password?: string
  pixivId?: string
  newPassword?: string
  email?: string
}

export function editUserAccount(info: EditOptions): Promise<any> {
  if (!info) return Promise.reject(new TypeError('info required'))
  const body: StringMap<string> = {}
  if (info.password) body.current_password = info.password
  if (info.pixivId) body.new_user_account = info.pixivId
  if (info.newPassword) body.new_password = info.newPassword
  if (info.email) body.new_mail_address = info.email
  return authRequest('https://accounts.pixiv.net/api/account/edit', { method: 'POST', body })
}

export function sendVerificationEmail() {
  return authRequest('/v1/mail-authentication/send', { method: 'POST' })
}

class PixivUser {
  static COLLECT_KEY = 'user_previews'

  is_muted: boolean
  user: UserGeneral
  profile: UserProfile
  profile_publicity: UserPublicity
  workspace: UserWorkspace
  _illusts: Collection<'illust'>
  _novels: Collection<'novel'>
  _followers?: Collection<'user'>
  _followings?: Collection<'user'>

  constructor(data) {
    this.user = data.user
    this.is_muted = data.is_muted
    this.profile = data.profile
    this.profile_publicity = data.profile_publicity
    this.workspace = data.workspace
    this._illusts = new Collection('illust', data)
    this._novels = new Collection('novel', data)
  }

  get id() {
    return this.user.id
  }

  search(...args) {
    return search('user', this.id, ...args)
  }

  detail(): Promise<this> {
    if (this.profile) return Promise.resolve(this)
    return this.search('detail', {}, (data) => {
      return Object.assign(this, data)
    })
  }

  illusts(): Promise<Collection<'illust'>> {
    if (this._illusts.hasData) return Promise.resolve(this._illusts)
    return this.search('illusts', {}, (data) => {
      return this._illusts = new Collection('illust', data)
    })
  }

  novels(): Promise<Collection<'novel'>> {
    if (this._novels.hasData) return Promise.resolve(this._novels)
    return this.search('novels', {}, (data) => {
      return this._novels = new Collection('novel', data)
    })
  }

  followers(): Promise<Collection<'user'>> {
    if (this._followers) return Promise.resolve(this._followers)
    return this.search('follower', {}, (data) => {
      return this._followers = new Collection('user', data)
    })
  }

  followings(): Promise<Collection<'user'>> {
    if (this._followings) return Promise.resolve(this._followings)
    return this.search('following', {}, (data) => {
      return this._followings = new Collection('user', data)
    })
  }

  follow(restrict: RestrictTypes = 'public') {
    return authRequest('/v1/user/follow/add', {
      method: 'POST',
      body: {
        user_id: this.id,
        restrict,
      }
    })
  }

  unfollow() {
    return authRequest('/v1/user/follow/delete', {
      method: 'POST',
      body: {
        user_id: this.id,
      }
    })
  }
}

class PixivIllust {
  static COLLECT_KEY = 'illusts'

  id: number
  title: string
  type: string
  caption: string
  restrict: 0 | 1 | 2
  user: UserGeneral
  author: PixivUser
  tags: Tag[]
  tools: Array<any>
  create_date: string
  page_count: string
  width: number
  height: number
  sanity_level: number
  total_view: number
  total_bookmarks: number
  total_comments: number
  is_bookmarked: boolean
  is_muted: boolean
  visible: boolean
  series: any // FIXME: any
  image_urls: ImageURLs
  meta_single_page: {
    original_image_url: string
  }
  meta_pages: Array<any> // FIXME: any
  _bookmark: any
  _comments?: Collection<'comment'>
  _related?: Collection<'illust'>

  constructor(data) {
    Object.assign(this, data)
    this.author = new PixivUser({ user: this.user })
  }

  search(...args) {
    return search('illust', this.id, ...args)
  }

  detail(): Promise<this> {
    return this.search('detail', {}, (data) => {
      return Object.assign(this, data)
    })
  }

  bookmark() {
    if (this._bookmark) return Promise.resolve(this._bookmark)
    return this.search('bookmarkDetail', {}, (data) => {
      return this._bookmark = data
    })
  }

  comments(): Promise<Collection<'comment'>> {
    if (this._comments) return Promise.resolve(this._comments)
    return this.search('comments', {}, (data) => {
      return this._comments = new Collection('comment', data)
    })
  }

  related(): Promise<Collection<'illust'>> {
    if (this._related) return Promise.resolve(this._related)
    return this.search('related', {}, (data) => {
      return this._related = new Collection('illust', data)
    })
  }

  addComment(comment) {
    if (!comment) return Promise.reject(new TypeError('comment required'))
    return authRequest('/v1/illust/comment/add', {
      method: 'POST',
      body: {
        illust_id: this.id,
        comment,
      }
    })
  }

  addBookmark(tags = [], restrict = 'public') {
    if (!(tags instanceof Array)) return Promise.reject(new TypeError('invalid tags'))
    return authRequest('/v2/illust/bookmark/add', {
      method: 'POST',
      body: {
        illust_id: this.id,
        restrict,
        tags,
      }
    })
  }

  deleteBookmark() {
    return authRequest('/v1/illust/bookmark/delete', {
      method: 'POST',
      body: {
        illust_id: this.id,
      }
    })
  }
}

class PixivNovel {
  static COLLECT_KEY = 'novels'

  id: number
  title: string
  caption: string
  restrict: 0 | 1 | 2
  user: UserGeneral
  author: PixivUser
  tags: Tag[]
  image_urls: ImageURLs
  create_date: string
  page_count: number
  text_length: number
  series: any // FIXME: any
  visible: boolean
  is_bookmarked: boolean
  is_muted: boolean
  total_bookmarks: number
  total_view: number
  total_comments: number

  constructor(data) {
    Object.assign(this, data)
    this.author = new PixivUser({ user: this.user })
  }

  search(...args) {
    return search('novel', this.id, ...args)
  }

  addComment(comment) {
    if (!comment) return Promise.reject(new TypeError('comment required'))
    return authRequest('/v1/novel/comment/add', {
      method: 'POST',
      body: {
        novel_id: this.id,
        comment,
      }
    })
  }

  addBookmark(tags = [], restrict = 'public') {
    if (!(tags instanceof Array)) return Promise.reject(new TypeError('invalid tags'))
    return authRequest('/v2/novel/bookmark/add', {
      method: 'POST',
      body: {
        novel_id: this.id,
        restrict,
        tags,
      }
    })
  }

  deleteBookmark() {
    return authRequest('/v1/novel/bookmark/delete', {
      method: 'POST',
      body: {
        novel_id: this.id,
      }
    })
  }
}

class PixivComment {
  static COLLECT_KEY = 'comments'

  id: number
  comment: string
  date: string
  user: UserGeneral
  author: PixivUser
  has_replies: boolean
  _replies?: Collection<'comment'>

  constructor(data) {
    Object.assign(this, data)
    this.author = new PixivUser({ user: this.user })
  }

  search(...args) {
    return search('comment', this.id, ...args)
  }

  replies(): Promise<Collection<'comment'>> {
    if (this._replies) return Promise.resolve(this._replies)
    return this.search('replies', {}, (data) => {
      return this._replies = new Collection('comment', data)
    })
  }
}

const PixivObjectMap = {
  user: PixivUser,
  illust: PixivIllust,
  novel: PixivNovel,
  comment: PixivComment,
}

type PixivTypeMap = TypeMap<typeof PixivObjectMap>

export class Collection<K extends keyof PixivTypeMap> {
  private _type: typeof PixivObjectMap[K]

  data: Array<PixivTypeMap[K]>
  next?: string
  limit?: number
  hasData?: boolean

  constructor(type: K, data: StringMap<string> = {}) {
    this._type = PixivObjectMap[type]
    this.data = []
    if (data[this._type.COLLECT_KEY]) {
      this.hasData = true
      this._pushResult(data)
    } else {
      this.hasData = false
    }
  }

  _pushResult(result): Array<PixivTypeMap[K]> {
    this.data.push(...result[this._type.COLLECT_KEY].map(item => {
      return item instanceof this._type ? item : Reflect.construct(this._type, [item])
    }))
    this.next = result.next_url
    this.limit = result.search_span_limit
    return this.data
  }

  extend(): Promise<Array<PixivTypeMap[K]>> {
    if (!this.hasData) return Promise.reject(new Error('Initial data required.'))
    if (!this.next) return Promise.resolve(this.data)
    return authRequest(this.next, {}, result => this._pushResult(result))
  }
}

function collect<K extends keyof PixivTypeMap>(type: K): (data?: StringMap<string>) => Collection<K> {
  return (data?: StringMap<string>) => new Collection(type, data)
}

interface CategoryMap<T> {
  word?: T
  user?: T
  illust?: T
  novel?: T
  comment?: T
  series?: T
  get_users?: T
  get_illusts?: T
  get_mangas?: T
  get_novels?: T
}

const SearchKeyMap: CategoryMap<string> = {
  word: 'word',
  user: 'user_id',
  illust: 'illust_id',
  novel: 'novel_id',
  comment: 'comment_id',
  series: 'series_id',
}

const SearchDefaultMap: CategoryMap<string> = {
  word: 'illust',
  user: 'detail',
  illust: 'detail',
  novel: 'detail',
  comment: 'replies',
  series: 'detail',
  get_users: 'recommended',
  get_illusts: 'recommended',
  get_mangas: 'recommended',
  get_novels: 'recommended',
}

interface SearchQuery {
  url: string
  options?: StringMap<string | number | boolean>
  then?: (data: any) => any
}

const SearchData: CategoryMap<StringMap<SearchQuery>> = {
  word: {
    illust: {
      url: '/v1/search/illust',
      options: {
        target: 'partial_match_for_tags',
        sort: 'date_desc',
      },
      then: collect('illust')
    },
    illustPopularPreview: {
      url: '/v1/search/popular-preview/illust',
      options: {
        target: 'partial_match_for_tags',
      },
      then: collect('illust')
    },
    illustBookmarkRanges: {
      url: '/v1/search/bookmark-ranges/illust',
      options: {
        target: 'partial_match_for_tags',
      },
      then: collect('illust')
    },
    novel: {
      url: '/v1/search/novel',
      options: {
        target: 'partial_match_for_tags',
        sort: 'date_desc',
      },
      then: collect('novel')
    },
    novelPopularPreview: {
      url: '/v1/search/popular-preview/novel',
      options: {
        target: 'partial_match_for_tags',
      },
      then: collect('novel')
    },
    novelBookmarkRanges: {
      url: '/v1/search/bookmark-ranges/novel',
      options: {
        target: 'partial_match_for_tags',
      },
      then: collect('novel')
    },
    user: {
      url: '/v1/search/user',
      then: collect('user')
    },
    autoComplete: {
      url: '/v1/search/autocomplete',
      then: data => data.search_auto_complete_keywords
    }
  },
  user: {
    detail: {
      url: '/v1/user/detail',
      then: data => new PixivUser(data)
    },
    illusts: {
      url: '/v1/user/illusts',
      then: collect('illust')
    },
    novels: {
      url: '/v1/user/novels',
      then: collect('novel')
    },
    bookmarkIllusts: {
      url: '/v1/user/bookmarks/illust',
      options: {
        restrict: 'public'
      },
      then: collect('illust')
    },
    bookmarkIllustTags: {
      url: '/v1/user/bookmark-tags/illust',
      options: {
        restrict: 'public'
      }
    },
    bookmarkNovel: {
      url: '/v1/user/bookmarks/novel',
      options: {
        restrict: 'public'
      }
    },
    bookmarkNovelTags: {
      url: '/v1/user/bookmark-tags/novel',
      options: {
        restrict: 'public'
      }
    },
    myPixiv: {
      url: '/v1/user/mypixiv',
      then: collect('user')
    },
    following: {
      url: '/v1/user/following',
      options: {
        restrict: 'public'
      },
      then: collect('user')
    },
    follower: {
      url: '/v1/user/follower',
      then: collect('user')
    },
    followDetail: {
      url: '/v1/user/follow/detail',
      then: data => data.follow_detail
    }
  },
  illust: {
    detail: {
      url: '/v1/illust/detail',
      then: data => new PixivIllust(data.illust)
    },
    bookmarkDetail: {
      url: '/v2/illust/bookmark/detail',
      then: data => data.bookmark_detail
    },
    comments: {
      url: '/v2/illust/comments',
      then: collect('comment')
    },
    related: {
      url: '/v2/illust/related',
      then: collect('illust')
    },
    metadata: {
      url: '/v1/ugoira/metadata',
      then: (data) => {
        if (data.ugoira_metadata) {
          return data.ugoira_metadata
        } else {
          throw data
        }
      }
    }
  },
  novel: {
    detail: {
      url: '/v2/novel/detail',
      then: data => new PixivNovel(data.novel)
    },
    text: {
      url: '/v1/novel/text'
    },
    bookmarkDetail: {
      url: '/v2/novel/bookmark/detail',
      then: data => data.bookmark_detail
    },
    comments: {
      url: '/v2/novel/comments',
      then: collect('comment')
    },
    related: {
      url: '/v2/novel/related',
      then: collect('novel')
    },
  },
  comment: {
    replies: {
      url: '/v1/illust/comment/replies',
      then: collect('comment')
    }
  },
  series: {
    detail: {
      url: '/v1/novel/series',
      then: collect('novel')
    }
  },
  get_users: {
    recommended: {
      url: '/v1/user/recommended',
      then: collect('user')
    },
  },
  get_illusts: {
    walkthrough: {
      url: '/v1/walkthrough/illusts',
      then: collect('illust')
    },
    new: {
      url: '/v1/illust/new',
      options: {
        content_type: 'illust'
      },
      then: collect('illust')
    },
    followed: {
      url: '/v2/illust/follow',
      options: {
        restrict: 'all'
      },
      then: collect('illust')
    },
    recommended: {
      url: '/v1/illust/recommended',
      options: {
        include_ranking_illusts: true
      },
      then: collect('illust')
    },
    ranking: {
      url: '/v1/illust/ranking',
      options: {
        mode: 'day'
      },
      then: collect('illust')
    },
    myPixiv: {
      url: '/v2/illust/mypixiv',
      then: collect('illust')
    },
    trendingTags: {
      url: '/v1/trending-tags/illust',
      then: data => data.trend_tags
    }
  },
  get_mangas: {
    recommended: {
      url: '/v1/manga/recommended',
      options: {
        include_ranking_label: true
      },
      then: collect('illust')
    },
    new: {
      url: '/v1/illust/new',
      options: {
        content_type: 'manga'
      },
      then: collect('illust')
    }
  },
  get_novels: {
    new: {
      url: '/v1/novel/new',
      options: {
        content_type: 'illust'
      },
      then: collect('novel')
    },
    followed: {
      url: '/v1/novel/follow',
      options: {
        restrict: 'all'
      },
      then: collect('novel')
    },
    recommended: {
      url: '/v1/novel/recommended',
      options: {
        include_ranking_novels: true
      },
      then: collect('novel')
    },
    ranking: {
      url: '/v1/novel/ranking',
      options: {
        mode: 'day'
      },
      then: collect('novel')
    },
    myPixiv: {
      url: '/v1/novel/mypixiv',
      then: collect('novel')
    },
    trendingTags: {
      url: '/v1/trending-tags/novel',
      then: data => data.trend_tags
    }
  }
}

export function search<
  V extends keyof typeof SearchData,
  T extends keyof typeof SearchData[V]
>(
  category: V,
  key?: string | number | null,
  type?: T,
  options?: StringMap<string>,
  callback?: (arg: any) => any
): Promise<any> {
  if (!SearchData[category]) {
    if (category) {
      return Promise.reject(new RangeError(`"${category}" is not a supported category.`))
    } else {
      return Promise.reject(new RangeError('Category required.'))
    }
  }
  if (category === 'get_users' && type === 'followed') {
    key = _config.auth.user.id
    category = 'user' as V
    type = 'following' as T
  }
  let search = SearchData[category][type]
  if (!search) {
    if (SearchDefaultMap[category]) {
      search = SearchData[category][SearchDefaultMap[category]]
    } else if (type) {
      return Promise.reject(new RangeError(`"${type}" is not a supported type.`))
    } else {
      return Promise.reject(new RangeError('Type required.'))
    }
  }
  const query: StringMap<string | number> = { filter: 'for_ios' }
  if (SearchKeyMap[category]) {
    if (!key) return Promise.reject(new TypeError('key required'))
    query[SearchKeyMap[category]] = key
  }
  return authRequest(`${search.url}?${
    qs.stringify(Object.assign(query, search.options, toKebab(options)))
  }`, {}, callback || search.then)
}
