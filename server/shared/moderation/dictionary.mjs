// Balanced dictionary v1. Explicit forms avoid substring/affix false positives.
export const version = 1;
export const words = [
  'fuck', 'fucks', 'fucked', 'fucking', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers',
  'shit', 'shits', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard', 'bastards',
  'asshole', 'assholes', 'cunt', 'cunts', 'dick', 'dicks', 'cock', 'cocks', 'pussy',
  'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots',
  'puta', 'putangina', 'putang ina', 'putanginamo', 'putang ina mo', 'tangina', 'tang ina',
  'tanginamo', 'tang ina mo', 'pota', 'potangina', 'potang ina', 'punyeta', 'punyemas',
  'gago', 'gaga', 'gagong', 'gagang', 'gaguhan', 'ginagago', 'gaguhin', 'kagaguhan',
  'ulol', 'ulul', 'ululin', 'kaululan', 'tarantado', 'tarantada', 'tarantadong',
  'tanga', 'tangang', 'tangahan', 'katangahan', 'bobo', 'bobong', 'boba', 'bobang', 'kabobohan',
  'lintik', 'leche', 'bwisit', 'buwisit', 'yawa', 'hayop ka', 'pakyu', 'pak yu',
  'kantot', 'kantutan', 'kantutin', 'kinantot', 'kakantutin', 'kupal', 'kupalan',
  'tite', 'titi', 'etits', 'burat', 'bilat', 'puke', 'puki', 'pekpek',
];
export const substitutions = { a: '[a@4]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s$5]', t: '[t7]' };
export const separator = '[ ._-]*';
// Protect explicit links, emails, code spans, UUIDs, paths, and multi-part identifiers.
export const protectedPattern = 'https?://[^\\s]+|www\\.[^\\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}|`[^`]*`|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|(?:[A-Za-z0-9]{2,}_)+[A-Za-z0-9]{2,}|(?:/[A-Za-z0-9_.-]+){2,}';
