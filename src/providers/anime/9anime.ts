import { load } from 'cheerio';
import axios from 'axios';

import {
  AnimeParser,
  ISearch,
  IAnimeInfo,
  IAnimeEpisode,
  MediaStatus,
  SubOrSub,
  IAnimeResult,
  IEpisodeServer,
  ISource,
  StreamingServers,
  MediaFormat,
  ProxyConfig,
} from '../../models';
import { StreamTape, VizCloud, Filemoon } from '../../extractors';
import { USER_AGENT, range } from '../../utils';

/**
 * **Use at your own risk :)** 9anime devs keep changing the keys every week
 */
class NineAnime extends AnimeParser {
  override readonly name = '9Anime';
  private nineAnimeResolver = '';
  private apiKey = '';
  protected override baseUrl = 'https://9anime.pl';
  protected override logo =
    'https://d1nxzqpcg2bym0.cloudfront.net/google_play/com.my.nineanime/87b2fe48-9c36-11eb-8292-21241b1c199b/128x128';
  protected override classPath = 'ANIME.NineAnime';
  override readonly isWorking = false;

  constructor(nineAnimeResolver?: string, proxyConfig?: ProxyConfig, apiKey?: string) {
    super('https://9anime.pl', proxyConfig && proxyConfig.url ? proxyConfig : undefined);
    this.nineAnimeResolver = nineAnimeResolver ?? this.nineAnimeResolver;
    this.apiKey = apiKey ?? this.apiKey;
  }

  override async search(query: string, page: number = 1): Promise<ISearch<IAnimeResult>> {
    const searchResult: ISearch<IAnimeResult> = {
      currentPage: page,
      hasNextPage: false,
      results: [],
    };

    try {
      const vrf = await this.ev(query);
      const res = await this.client.get(
        `/filter?keyword=${query.replace(/%20/g, '+')}&vrf=${vrf}&page=${page}`
      );

      const $ = load(res.data);

      searchResult.hasNextPage =
        $(`ul.pagination`).length > 0
          ? $('ul.pagination > li').last().hasClass('disabled')
            ? false
            : true
          : false;

      $('#list-items > div.item').each((i, el) => {
        let type = undefined;
        switch ($(el).find('div > div.ani > a > div.meta > div > div.right').text()!.trim()) {
          case 'MOVIE':
            type = MediaFormat.MOVIE;
            break;
          case 'TV':
            type = MediaFormat.TV;
            break;
          case 'OVA':
            type = MediaFormat.OVA;
            break;
          case 'SPECIAL':
            type = MediaFormat.SPECIAL;
            break;
          case 'ONA':
            type = MediaFormat.ONA;
            break;
          case 'MUSIC':
            type = MediaFormat.MUSIC;
            break;
        }

        searchResult.results.push({
          id: $(el).find('div > div.ani > a').attr('href')?.split('/')[2]!,
          title: $(el).find('div > div.info > div.b1 > a').text()!,
          url: `${this.baseUrl}${$(el).find('div > div.ani > a').attr('href')}`,
          image: $(el).find('div > div.ani > a > img').attr('src'),
          type: type,
          hasSub: $(el).find('div > div.ani > a .meta .sub').length > 0,
          hasDub: $(el).find('div > div.ani > a .meta .dub').length > 0
        });
      });

      return searchResult;
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }

  override async fetchAnimeInfo(animeUrl: string): Promise<IAnimeInfo> {
    if (!animeUrl.startsWith(this.baseUrl)) animeUrl = `/watch/${animeUrl}`;

    const animeInfo: IAnimeInfo = {
      id: '',
      title: '',
      url: animeUrl,
    };

    try {
      const res = await this.client.get(animeUrl);

      const $ = load(res.data);

      animeInfo.id = new URL(`${this.baseUrl}/animeUrl`).pathname.split('/')[2];
      animeInfo.title = $('h1.title').text();
      animeInfo.jpTitle = $('h1.title').attr('data-jp');
      animeInfo.genres = Array.from(
        $('div.meta:nth-child(1) > div:nth-child(5) > span > a').map((i, el) => $(el).text())
      );
      animeInfo.image = $('.binfo > div.poster > span > img').attr('src');
      animeInfo.description = $('.content').text()?.trim();
      switch ($('div.meta:nth-child(1) > div:nth-child(1) > span:nth-child(1) > a').text()) {
        case 'MOVIE':
          animeInfo.type = MediaFormat.MOVIE;
          break;
        case 'TV':
          animeInfo.type = MediaFormat.TV;
          break;
        case 'OVA':
          animeInfo.type = MediaFormat.OVA;
          break;
        case 'SPECIAL':
          animeInfo.type = MediaFormat.SPECIAL;
          break;
        case 'ONA':
          animeInfo.type = MediaFormat.ONA;
          break;
        case 'MUSIC':
          animeInfo.type = MediaFormat.MUSIC;
          break;
      }
      animeInfo.studios = Array.from(
        $('div.meta:nth-child(1) > div:nth-child(2) > span:nth-child(1) > a').map(
          (i, el) => $(el).text()?.trim()!
        )
      );
      animeInfo.releaseDate = $('div.meta:nth-child(1) > div:nth-child(3) > span:nth-child(1)')
        .text()
        .trim()
        .split('to')[0]
        ?.trim();

      switch ($('div.meta:nth-child(1) > div:nth-child(4) > span:nth-child(1)').text()?.trim()) {
        case 'Releasing':
          animeInfo.status = MediaStatus.ONGOING;
          break;
        case 'Completed':
          animeInfo.status = MediaStatus.COMPLETED;
          break;
        case 'Cancelled':
          animeInfo.status = MediaStatus.CANCELLED;
          break;
        case 'Unknown':
          animeInfo.status = MediaStatus.UNKNOWN;
          break;
        default:
          animeInfo.status = MediaStatus.UNKNOWN;
          break;
      }

      animeInfo.score = parseFloat(
        $('.bmeta > div:nth-child(2) > div:nth-child(2) > span:nth-child(1)')?.text().split('by')[0]
      );
      animeInfo.premiered = $(
        '.bmeta > div:nth-child(2) > div:nth-child(3) > span:nth-child(1) > a:nth-child(1)'
      ).text();
      animeInfo.duration = $('.bmeta > div:nth-child(2) > div:nth-child(4) > span:nth-child(1)').text();
      animeInfo.views = parseInt(
        $('.bmeta > div:nth-child(2) > div:nth-child(5) > span:nth-child(1)')
          .text()
          .split('by')
          .join('')
          .split(',')
          .join('')
          .trim()
      );
      animeInfo.otherNames = $('.names')
        .text()
        .split('; ')
        .map(name => name?.trim());
      animeInfo.hasSub = $('div#w-info > .binfo > .info > .meta .sub').length == 1
      animeInfo.hasDub = $('div#w-info > .binfo > .info > .meta .dub').length == 1

      const id = $('#watch-main').attr('data-id')!;

      const vrf = await this.ev(id);
      const {
        data: { result },
      } = await this.client.get(`/ajax/episode/list/${id}?vrf=${vrf}`);
      const $$ = load(result);
      animeInfo.totalEpisodes = $$('div.episodes > ul > li > a').length;
      animeInfo.episodes = [];

      const episodes: IAnimeEpisode[] = [];
      $$('div.episodes > ul > li > a').map((i, el) => {
        $$(el)
          .map((i, el) => {
            const possibleIds = $$(el).attr('data-ids')?.split(',')!;
            const number = parseInt($$(el).attr('data-num')?.toString()!);
            const title = $$(el).find('span').text().length > 0 ? $$(el).find('span').text() : undefined;
            const isFiller = $$(el).hasClass('filler');

            episodes.push({
              id: possibleIds[0],
              dubId: possibleIds[1],
              number: number,
              title: title,
              isFiller: isFiller,
            });
          })
          .get();
      });
      animeInfo.episodes?.push(...episodes);

      return animeInfo;
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }

  override async fetchEpisodeSources(
    episodeId: string,
    server: StreamingServers = StreamingServers.VizCloud
  ): Promise<ISource> {
    if (episodeId.startsWith('http')) {
      const serverUrl = new URL(episodeId);
      switch (server) {
        case StreamingServers.StreamTape:
          return {
            headers: { Referer: serverUrl.href, 'User-Agent': USER_AGENT },
            sources: await new StreamTape().extract(serverUrl),
          };
        case StreamingServers.VizCloud:
          return {
            headers: { Referer: serverUrl.href, 'User-Agent': USER_AGENT },
            sources: await new VizCloud().extract(serverUrl, this.nineAnimeResolver, this.apiKey),
          };
        case StreamingServers.MyCloud:
          return {
            headers: { Referer: serverUrl.href, 'User-Agent': USER_AGENT },
            sources: await new VizCloud().extract(serverUrl, this.nineAnimeResolver, this.apiKey),
          };
        case StreamingServers.Filemoon:
          return {
            headers: { Referer: serverUrl.href, 'User-Agent': USER_AGENT },
            sources: await new Filemoon().extract(serverUrl),
          };
      }
    }
    try {
      const servers = await this.fetchEpisodeServers(episodeId);
      let s = servers.find(s => s.name === server);
      switch (server) {
        case StreamingServers.VizCloud:
          s = servers.find(s => s.name === 'vidstream')!;
          if (!s) throw new Error('Vidstream server found');
          break;
        case StreamingServers.StreamTape:
          s = servers.find(s => s.name === 'streamtape');
          if (!s) throw new Error('Streamtape server found');
          break;
        case StreamingServers.MyCloud:
          s = servers.find(s => s.name === 'mycloud');
          if (!s) throw new Error('Mycloud server found');
          break;
        case StreamingServers.Filemoon:
          s = servers.find(s => s.name === 'filemoon');
          if (!s) throw new Error('Filemoon server found');
          break;
        default:
          throw new Error('Server not found');
      }

      const serverVrf = (
        await axios.get(
          `${this.nineAnimeResolver}/vrf?query=${encodeURIComponent(s.url)}&apikey=${this.apiKey}`
        )
      ).data.url;
      const serverSource = (await this.client.get(`/ajax/server/${s.url}?vrf=${serverVrf}`)).data;
      const embedURL = (
        await axios.get(
          `${this.nineAnimeResolver}/decrypt?query=${encodeURIComponent(serverSource.result.url)}&apikey=${
            this.apiKey
          }`
        )
      ).data.url;

      if (embedURL.startsWith('http')) {
        const response: ISource = await this.fetchEpisodeSources(embedURL, server);
        response.embedURL = embedURL;
        response.intro = {
          start: serverSource?.result?.skip_data?.intro_begin ?? 0,
          end: serverSource?.result?.skip_data?.intro_end ?? 0,
        };

        return response;
      } else {
        throw new Error('Server did not respond correctly');
      }
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }

  override async fetchEpisodeServers(episodeId: string): Promise<IEpisodeServer[]> {
    if (!episodeId.startsWith(this.baseUrl))
      episodeId = `/ajax/server/list/${episodeId}?vrf=${await this.ev(episodeId)}`;

    const {
      data: { result },
    } = await this.client.get(episodeId);

    const $ = load(result);

    const servers: IEpisodeServer[] = [];
    $('.type > ul > li').each((i, el) => {
      const serverId = $(el).attr('data-link-id')!;
      servers.push({
        name: $(el).text().toLocaleLowerCase(),
        url: `${serverId}`,
      });
    });

    return servers;
  }

  private async ev(query: string): Promise<string> {
    const { data } = await axios.get(
      `${this.nineAnimeResolver}/vrf?query=${encodeURIComponent(query)}&apikey=${this.apiKey}`
    );
    return data.url;
  }
}

// (async () => {
//   const nineAnime = new NineAnime();
//   const searchResults = await nineAnime.search('attack on titan');
//   const animeInfo = await nineAnime.fetchAnimeInfo(searchResults.results[0].id);
//   const episodeSources = await nineAnime.fetchEpisodeSources(animeInfo.episodes![0].id, StreamingServers.Filemoon);
//   console.log(episodeSources);
// })();

export default NineAnime;
