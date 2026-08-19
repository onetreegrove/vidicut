export interface DownloadResultFile {
  kind: 'video' | 'image' | 'cover' | 'audio';
  path: string;
  url: string;
  width?: number;
  height?: number;
}

export interface AuthorInfo {
  nickname: string;
  uid: string;
  sec_uid: string;
  avatar?: string;
}

export interface DouyinAwemeItem {
  aweme_id: string;
  desc: string;
  create_time: number;
  author: AuthorInfo;
  media_type: 'video' | 'images';
  video_url?: string;
  images?: string[];
  cover_url?: string;
  music_url?: string;
  music_title?: string;
  mix_name?: string;
  stats?: {
    digg_count: number;
    comment_count: number;
    share_count: number;
  };
}

export interface DyDownloadOutput {
  status: 'success' | 'error';
  message?: string;
  type?: 'video' | 'images' | 'mix' | 'profile';
  aweme_id?: string;
  mix_id?: string;
  mix_name?: string;
  sec_user_id?: string;
  title?: string;
  author?: AuthorInfo;
  files: DownloadResultFile[];
  cover?: string;
  music?: {
    title?: string;
    url?: string;
  };
  items?: DyDownloadOutput[];
}
